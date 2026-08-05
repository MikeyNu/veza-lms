import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { CreateBlueprintDto } from "./catalogue.dto.js";

type DefinitionType = CreateBlueprintDto["definitionType"];

const allowedParents: Readonly<Record<DefinitionType, readonly DefinitionType[]>> =
  Object.freeze({
    subject: [],
    module: ["subject"],
    course: ["subject", "module"],
    unit: ["subject", "module", "course"],
  });

@Injectable()
export class CatalogueDefinitionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createBlueprint(institutionId: string, input: CreateBlueprintDto) {
    const context = this.context.require();
    const definitionId = randomUUID();
    const versionId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      if (input.parentDefinitionId) {
        const parent = await client.query<{
          definition_type: DefinitionType;
        } & QueryResultRow>(
          `SELECT definition_type FROM course_definitions
           WHERE id=$1 AND institution_id=$2 AND status='active'`,
          [input.parentDefinitionId, institutionId],
        );
        const parentDefinition = parent.rows[0];
        if (!parentDefinition) {
          throw new NotFoundException("Parent curriculum definition was not found");
        }
        if (
          !allowedParents[input.definitionType].includes(
            parentDefinition.definition_type,
          )
        ) {
          throw new BadRequestException(
            `${input.definitionType} cannot be nested under ${parentDefinition.definition_type}`,
          );
        }
      } else if (input.definitionType === "unit") {
        throw new BadRequestException(
          "A unit requires a parent subject, module or course",
        );
      }
      if (input.organisationalUnitId) {
        const unit = await client.query(
          `SELECT id FROM organisational_units
           WHERE id=$1 AND institution_id=$2 AND status='active'`,
          [input.organisationalUnitId, institutionId],
        );
        if (!unit.rowCount) {
          throw new NotFoundException("Active organisational unit was not found");
        }
      }
      const uniqueOutcomes = [...new Set(input.outcomeIds)];
      const outcomes = await client.query(
        `SELECT id FROM learning_outcomes
         WHERE institution_id=$1 AND id=ANY($2::uuid[]) AND status='active'`,
        [institutionId, uniqueOutcomes],
      );
      if (outcomes.rowCount !== uniqueOutcomes.length) {
        throw new BadRequestException(
          "Every mapped outcome must be active in this institution",
        );
      }

      await client.query(
        `INSERT INTO course_definitions (
           id,tenant_id,institution_id,organisational_unit_id,parent_definition_id,
           code,title,definition_type,subject_area,status,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10)`,
        [
          definitionId,
          context.tenantId,
          institutionId,
          input.organisationalUnitId ?? null,
          input.parentDefinitionId ?? null,
          input.code,
          input.title.trim(),
          input.definitionType,
          input.subjectArea?.trim() || null,
          context.actorId,
        ],
      );
      await client.query(
        `INSERT INTO course_blueprint_versions (
           id,tenant_id,institution_id,course_definition_id,version_number,title,
           description,credit_value,notional_hours,delivery_modes,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$10)`,
        [
          versionId,
          context.tenantId,
          institutionId,
          definitionId,
          input.title.trim(),
          input.description.trim(),
          input.creditValue ?? null,
          input.notionalHours ?? null,
          input.deliveryModes,
          context.actorId,
        ],
      );
      for (const outcomeId of uniqueOutcomes) {
        await client.query(
          `INSERT INTO blueprint_outcome_mappings (
             tenant_id,course_blueprint_version_id,learning_outcome_id,coverage_level
           ) VALUES ($1,$2,$3,'developed')`,
          [context.tenantId, versionId, outcomeId],
        );
      }
      const evidence = {
        institutionId,
        definitionId,
        definitionType: input.definitionType,
        parentDefinitionId: input.parentDefinitionId,
        code: input.code,
        outcomeCount: uniqueOutcomes.length,
        version: 1,
      };
      await this.record(client, versionId, evidence);
      return {
        courseDefinitionId: definitionId,
        versionId,
        versionNumber: 1,
        lifecycle: "draft",
        version: 1,
      };
    });
  }

  private async requireInstitution(
    client: PoolClient,
    institutionId: string,
  ): Promise<void> {
    const result = await client.query(
      "SELECT id FROM institutions WHERE id=$1 AND status='active'",
      [institutionId],
    );
    if (!result.rowCount) {
      throw new NotFoundException("Active institution was not found");
    }
  }

  private async record(
    client: PoolClient,
    versionId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const context = this.context.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType: "catalogue.blueprint.created",
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType: "course-blueprint-version",
      resourceId: versionId,
      correlationId: context.correlationId,
      afterState: evidence,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: "course-blueprint-version",
      aggregateId: versionId,
      aggregateVersion: 1,
      eventName: "catalogue.blueprint.created",
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: evidence,
    });
  }
}
