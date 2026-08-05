import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { ApproveCurriculumDto } from "./catalogue.dto.js";

type CurriculumResourceType = "programme-version" | "course-blueprint-version";

interface VersionRow extends QueryResultRow {
  id: string;
  institution_id: string;
  lifecycle: string;
  version: number;
  version_number: number;
  created_by: string;
  submitted_by: string | null;
  aggregate_id: string;
}

interface ReviewRow extends QueryResultRow {
  id: string;
  resource_version: number;
  status: string;
  validation_snapshot: {
    passed?: boolean;
    errors?: readonly unknown[];
  };
}

@Injectable()
export class CurriculumApprovalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  approveProgramme(
    institutionId: string,
    versionId: string,
    input: ApproveCurriculumDto,
  ) {
    return this.approve(
      institutionId,
      "programme-version",
      "programme_versions",
      "programme_id",
      versionId,
      input,
    );
  }

  approveBlueprint(
    institutionId: string,
    versionId: string,
    input: ApproveCurriculumDto,
  ) {
    return this.approve(
      institutionId,
      "course-blueprint-version",
      "course_blueprint_versions",
      "course_definition_id",
      versionId,
      input,
    );
  }

  private async approve(
    institutionId: string,
    resourceType: CurriculumResourceType,
    table: "programme_versions" | "course_blueprint_versions",
    aggregateColumn: "programme_id" | "course_definition_id",
    versionId: string,
    input: ApproveCurriculumDto,
  ) {
    if (input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) {
      throw new BadRequestException("Effective-until must be later than effective-from");
    }
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query(
        "SELECT id FROM institutions WHERE id=$1 AND status='active'",
        [institutionId],
      );
      if (!institution.rowCount) throw new NotFoundException("Active institution was not found");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`curriculum-approval:${resourceType}:${versionId}`],
      );
      const result = await client.query<VersionRow>(
        `SELECT id,institution_id,lifecycle,version,version_number,created_by,submitted_by,
                ${aggregateColumn} aggregate_id
         FROM ${table}
         WHERE id=$1 AND institution_id=$2
         FOR UPDATE`,
        [versionId, institutionId],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Curriculum version was not found");
      if (current.lifecycle !== "in_review" || current.version !== input.expectedVersion) {
        throw new ConflictException("Curriculum version changed or is not awaiting approval");
      }
      if (current.created_by === context.actorId || current.submitted_by === context.actorId) {
        throw new ConflictException("Curriculum approval requires an independent reviewer");
      }
      const reviewResult = await client.query<ReviewRow>(
        `SELECT id,resource_version,status,validation_snapshot
         FROM curriculum_change_reviews
         WHERE id=$1 AND institution_id=$2 AND resource_type=$3 AND resource_id=$4
         FOR UPDATE`,
        [input.approvalReviewId, institutionId, resourceType, versionId],
      );
      const review = reviewResult.rows[0];
      if (!review) throw new NotFoundException("Curriculum impact review was not found");
      if (review.status !== "current" || review.resource_version !== current.version) {
        throw new ConflictException("Curriculum impact review is stale");
      }
      if (
        review.validation_snapshot?.passed !== true ||
        (review.validation_snapshot?.errors?.length ?? 0) > 0
      ) {
        throw new ConflictException("Curriculum impact review contains blocking validation errors");
      }

      if (resourceType === "course-blueprint-version") {
        const mapping = await client.query(
          "SELECT 1 FROM blueprint_outcome_mappings WHERE course_blueprint_version_id=$1 LIMIT 1",
          [versionId],
        );
        if (!mapping.rowCount) {
          throw new ConflictException("A blueprint requires mapped outcomes before approval");
        }
      } else {
        const composition = await client.query(
          "SELECT 1 FROM programme_version_courses WHERE programme_version_id=$1 LIMIT 1",
          [versionId],
        );
        if (!composition.rowCount) {
          throw new ConflictException("A programme requires an approved course composition before approval");
        }
      }

      const previous = await client.query<{
        id: string;
        effective_from: string;
      } & QueryResultRow>(
        `SELECT id,effective_from FROM ${table}
         WHERE ${aggregateColumn}=$1 AND lifecycle='approved'
           AND effective_until IS NULL AND id <> $2
         FOR UPDATE`,
        [current.aggregate_id, versionId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].effective_from >= input.effectiveFrom) {
          throw new ConflictException("Replacement curriculum must take effect after the current version");
        }
        await client.query(
          `UPDATE ${table}
           SET effective_until=$2,updated_by=$3,updated_at=now(),version=version+1
           WHERE id=$1`,
          [previous.rows[0].id, input.effectiveFrom, context.actorId],
        );
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE ${table}
         SET lifecycle='approved',effective_from=$4,effective_until=$5,
             approval_notes=$6,approval_review_id=$7,approved_by=$8,approved_at=now(),
             updated_by=$8,updated_at=now(),version=version+1
         WHERE id=$1 AND institution_id=$2 AND version=$3
         RETURNING version`,
        [
          versionId,
          institutionId,
          input.expectedVersion,
          input.effectiveFrom,
          input.effectiveUntil ?? null,
          input.approvalNotes.trim(),
          input.approvalReviewId,
          context.actorId,
        ],
      );
      if (!updated.rows[0]) throw new ConflictException("Curriculum changed during approval");
      await client.query(
        `UPDATE curriculum_change_reviews
         SET status='consumed',consumed_by=$2,consumed_at=now()
         WHERE id=$1 AND status='current'`,
        [input.approvalReviewId, context.actorId],
      );
      const evidence = {
        institutionId,
        approvalReviewId: input.approvalReviewId,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        approvalNotes: input.approvalNotes.trim(),
        version: updated.rows[0].version,
      };
      await this.record(client, resourceType, versionId, evidence);
      return {
        id: versionId,
        lifecycle: "approved",
        version: updated.rows[0].version,
      };
    });
  }

  private async record(
    client: PoolClient,
    resourceType: CurriculumResourceType,
    resourceId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const context = this.context.require();
    const eventType = `catalogue.${resourceType}.approved`;
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType,
      resourceId,
      purpose: "independent curriculum approval",
      correlationId: context.correlationId,
      afterState: evidence,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: resourceType,
      aggregateId: resourceId,
      aggregateVersion: Number(evidence.version ?? 1),
      eventName: eventType,
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: evidence,
    });
  }
}
