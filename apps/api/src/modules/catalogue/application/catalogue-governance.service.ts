import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  AddCourseRequisiteDto,
  AllocateClassStaffDto,
  ChangeEnrolmentStatusDto,
  ChangeRunLifecycleDto,
  LinkProgrammeCourseDto,
} from "./catalogue-governance.dto.js";

interface VersionRow extends QueryResultRow { id: string; version: number; lifecycle: string; institution_id: string; }
interface EnrolmentRow extends QueryResultRow { id: string; institution_id: string; status: string; version: number; }

const runTransitions: Readonly<Record<string, readonly string[]>> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["open", "cancelled"],
  open: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const enrolmentTransitions: Readonly<Record<string, readonly string[]>> = {
  pending: ["active", "waitlisted", "cancelled"],
  active: ["withdrawn", "completed", "cancelled"],
  waitlisted: ["active", "cancelled"],
  withdrawn: [],
  completed: [],
  cancelled: [],
};

@Injectable()
export class CatalogueGovernanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async linkProgrammeCourse(institutionId: string, programmeVersionId: string, input: LinkProgrammeCourseDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const programme = await client.query<VersionRow>(
        "SELECT id,version,lifecycle,institution_id FROM programme_versions WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [programmeVersionId, institutionId],
      );
      const current = programme.rows[0];
      if (!current) throw new NotFoundException("Programme version was not found");
      if (!["draft", "in_review"].includes(current.lifecycle)) throw new ConflictException("Approved programme composition cannot be changed");
      if (current.version !== input.expectedProgrammeVersion) throw new ConflictException("Programme version changed since it was loaded");
      const blueprint = await client.query(
        "SELECT id FROM course_blueprint_versions WHERE id=$1 AND institution_id=$2 AND lifecycle='approved'",
        [input.blueprintVersionId, institutionId],
      );
      if (!blueprint.rowCount) throw new BadRequestException("Programme composition requires an approved blueprint from this institution");
      await client.query(
        `INSERT INTO programme_version_courses (
           tenant_id,programme_version_id,course_blueprint_version_id,sequence_number,requirement_type,credit_contribution
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [context.tenantId, programmeVersionId, input.blueprintVersionId, input.sequenceNumber, input.requirementType, input.creditContribution ?? null],
      );
      const version = await client.query<{ version: number } & QueryResultRow>(
        "UPDATE programme_versions SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING version",
        [programmeVersionId, context.actorId],
      );
      await this.record(client, "catalogue.programme.course-linked", "programme-version", programmeVersionId, {
        blueprintVersionId: input.blueprintVersionId,
        sequenceNumber: input.sequenceNumber,
        requirementType: input.requirementType,
        version: version.rows[0].version,
      });
      return { id: programmeVersionId, version: version.rows[0].version };
    });
  }

  async addRequisite(institutionId: string, blueprintVersionId: string, input: AddCourseRequisiteDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const blueprint = await client.query<VersionRow>(
        "SELECT id,version,lifecycle,institution_id FROM course_blueprint_versions WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [blueprintVersionId, institutionId],
      );
      const current = blueprint.rows[0];
      if (!current) throw new NotFoundException("Blueprint version was not found");
      if (!["draft", "in_review"].includes(current.lifecycle)) throw new ConflictException("Approved blueprint requisites cannot be changed");
      if (current.version !== input.expectedBlueprintVersion) throw new ConflictException("Blueprint version changed since it was loaded");
      const required = await client.query(
        "SELECT id FROM course_definitions WHERE id=$1 AND institution_id=$2 AND status='active'",
        [input.requiredCourseDefinitionId, institutionId],
      );
      if (!required.rowCount) throw new BadRequestException("Required course definition is unavailable in this institution");
      const self = await client.query(
        "SELECT course_definition_id FROM course_blueprint_versions WHERE id=$1",
        [blueprintVersionId],
      );
      if (self.rows[0]?.course_definition_id === input.requiredCourseDefinitionId) throw new BadRequestException("A course cannot require itself");
      await client.query(
        `INSERT INTO course_requisites (
           tenant_id,course_blueprint_version_id,required_course_definition_id,requisite_type,minimum_result
         ) VALUES ($1,$2,$3,$4,$5)`,
        [context.tenantId, blueprintVersionId, input.requiredCourseDefinitionId, input.requisiteType, input.minimumResult ?? null],
      );
      const version = await client.query<{ version: number } & QueryResultRow>(
        "UPDATE course_blueprint_versions SET version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING version",
        [blueprintVersionId, context.actorId],
      );
      await this.record(client, "catalogue.blueprint.requisite-added", "course-blueprint-version", blueprintVersionId, {
        requiredCourseDefinitionId: input.requiredCourseDefinitionId,
        requisiteType: input.requisiteType,
        version: version.rows[0].version,
      });
      return { id: blueprintVersionId, version: version.rows[0].version };
    });
  }

  async changeRunLifecycle(institutionId: string, runId: string, input: ChangeRunLifecycleDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const run = await client.query<VersionRow>(
        "SELECT id,version,lifecycle,institution_id FROM course_runs WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [runId, institutionId],
      );
      const current = run.rows[0];
      if (!current) throw new NotFoundException("Course run was not found");
      if (current.version !== input.expectedVersion) throw new ConflictException("Course run changed since it was loaded");
      if (!runTransitions[current.lifecycle]?.includes(input.lifecycle)) throw new ConflictException(`Course run cannot move from ${current.lifecycle} to ${input.lifecycle}`);
      if (input.lifecycle === "completed") {
        const active = await client.query("SELECT 1 FROM enrolments WHERE course_run_id=$1 AND status IN ('pending','active','waitlisted') AND effective_until IS NULL LIMIT 1", [runId]);
        if (active.rowCount) throw new ConflictException("Resolve current enrolments before completing the run");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE course_runs SET lifecycle=$3,version=version+1,updated_by=$4,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [runId, input.expectedVersion, input.lifecycle, context.actorId],
      );
      await this.record(client, "delivery.course-run.lifecycle-changed", "course-run", runId, {
        from: current.lifecycle,
        to: input.lifecycle,
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      });
      return { id: runId, lifecycle: input.lifecycle, version: updated.rows[0].version };
    });
  }

  async changeEnrolmentStatus(institutionId: string, enrolmentId: string, input: ChangeEnrolmentStatusDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<EnrolmentRow>(
        "SELECT id,institution_id,status,version FROM enrolments WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [enrolmentId, institutionId],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Enrolment was not found");
      if (current.version !== input.expectedVersion) throw new ConflictException("Enrolment changed since it was loaded");
      if (!enrolmentTransitions[current.status]?.includes(input.status)) throw new ConflictException(`Enrolment cannot move from ${current.status} to ${input.status}`);
      if (input.status === "completed" && input.completionResult === undefined) throw new BadRequestException("Completed enrolments require a result");
      const closesMembership = ["withdrawn", "completed", "cancelled"].includes(input.status);
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE enrolments SET status=$3,completion_result=$4,
           withdrawal_reason=CASE WHEN $3='withdrawn' THEN $5 ELSE withdrawal_reason END,
           effective_until=CASE WHEN $6 THEN now() ELSE NULL END,
           version=version+1,updated_by=$7,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [enrolmentId, input.expectedVersion, input.status, input.completionResult ?? null, input.reason.trim(), closesMembership, context.actorId],
      );
      await client.query(
        `INSERT INTO enrolment_transitions (
           id,tenant_id,institution_id,enrolment_id,from_status,to_status,reason,actor_id,correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [randomUUID(), context.tenantId, institutionId, enrolmentId, current.status, input.status, input.reason.trim(), context.actorId, context.correlationId],
      );
      await this.record(client, "enrolment.status-changed", "enrolment", enrolmentId, {
        from: current.status,
        to: input.status,
        completionResult: input.completionResult,
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      });
      return { id: enrolmentId, status: input.status, version: updated.rows[0].version };
    });
  }

  async allocateClassStaff(institutionId: string, classSectionId: string, input: AllocateClassStaffDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const section = await client.query(
        "SELECT id FROM class_sections WHERE id=$1 AND institution_id=$2 AND status IN ('planned','active')",
        [classSectionId, institutionId],
      );
      if (!section.rowCount) throw new NotFoundException("Active class section was not found");
      const staff = await client.query(
        `SELECT person.id FROM people person
         JOIN staff_profiles profile ON profile.person_id=person.id
         WHERE person.id=$1 AND profile.institution_id=$2 AND person.status='active'
           AND profile.status IN ('active','on_leave')`,
        [input.personId, institutionId],
      );
      if (!staff.rowCount) throw new BadRequestException("Allocated person requires a staff profile in this institution");
      if (input.validUntil && input.validUntil < input.validFrom) throw new BadRequestException("Allocation end date must not precede its start date");
      await client.query(
        `INSERT INTO class_staff_allocations (
           tenant_id,class_section_id,person_id,allocation_role,valid_from,valid_until,assigned_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [context.tenantId, classSectionId, input.personId, input.allocationRole, input.validFrom, input.validUntil ?? null, context.actorId],
      );
      await this.record(client, "delivery.class.staff-allocated", "class-section", classSectionId, {
        personId: input.personId,
        allocationRole: input.allocationRole,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        version: 1,
      });
      return { classSectionId, personId: input.personId, allocationRole: input.allocationRole };
    });
  }

  private async record(client: PoolClient, eventType: string, resourceType: string, resourceId: string, afterState: Record<string, unknown>) {
    const context = this.context.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType,
      resourceId,
      correlationId: context.correlationId,
      afterState,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: resourceType,
      aggregateId: resourceId,
      aggregateVersion: Number(afterState.version ?? 1),
      eventName: eventType,
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: afterState,
    });
  }
}
