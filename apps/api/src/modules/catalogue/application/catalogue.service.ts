import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  ApproveCurriculumDto,
  CreateBlueprintDto,
  CreateClassDto,
  CreateCohortDto,
  CreateEnrolmentDto,
  CreateOutcomeDto,
  CreateProgrammeDto,
  CreateRunDto,
  TransferEnrolmentDto,
} from "./catalogue.dto.js";

interface IdVersionRow extends QueryResultRow { id: string; version: number; }
interface PeriodRow extends QueryResultRow { starts_on: string; ends_on: string; status: string; }
interface RunRow extends QueryResultRow {
  id: string; institution_id: string; capacity: number | null; lifecycle: string;
  course_blueprint_version_id: string; starts_on: string; ends_on: string;
}
interface EnrolmentRow extends QueryResultRow {
  id: string; learner_person_id: string; course_run_id: string; status: string; version: number;
}

@Injectable()
export class CatalogueService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async workspace(institutionId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const [programmes, blueprints, outcomes, runs, enrolments] = await Promise.all([
        client.query(
          `SELECT version.id, programme.id programme_id, programme.institution_id, programme.code,
                  version.title, programme.programme_type, version.version_number, version.lifecycle,
                  version.credit_value, version.notional_hours, version.effective_from, version.effective_until,
                  version.version, count(link.course_blueprint_version_id)::int course_count
           FROM programme_versions version
           JOIN programmes programme ON programme.id=version.programme_id
           LEFT JOIN programme_version_courses link ON link.programme_version_id=version.id
           WHERE programme.institution_id=$1
           GROUP BY version.id,programme.id
           ORDER BY programme.code,version.version_number DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT version.id, definition.id course_definition_id, definition.institution_id, definition.code,
                  version.title, definition.subject_area, version.version_number, version.lifecycle,
                  version.credit_value, version.notional_hours, version.delivery_modes, version.version,
                  count(DISTINCT mapping.learning_outcome_id)::int outcome_count,
                  count(DISTINCT requisite.required_course_definition_id)::int requisite_count
           FROM course_blueprint_versions version
           JOIN course_definitions definition ON definition.id=version.course_definition_id
           LEFT JOIN blueprint_outcome_mappings mapping ON mapping.course_blueprint_version_id=version.id
           LEFT JOIN course_requisites requisite ON requisite.course_blueprint_version_id=version.id
           WHERE definition.institution_id=$1
           GROUP BY version.id,definition.id
           ORDER BY definition.code,version.version_number DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT id,institution_id,code,title,outcome_type,level_code,status,version
           FROM learning_outcomes WHERE institution_id=$1 ORDER BY code`,
          [institutionId],
        ),
        client.query(
          `SELECT run.id,run.institution_id,run.academic_period_id,
                  run.course_blueprint_version_id blueprint_version_id,run.code,run.title,
                  run.delivery_mode,run.starts_on,run.ends_on,run.capacity,run.lifecycle,run.version,
                  count(DISTINCT section.id)::int class_count,
                  count(DISTINCT enrolment.id) FILTER (WHERE enrolment.status='active' AND enrolment.effective_until IS NULL)::int active_enrolment_count
           FROM course_runs run
           LEFT JOIN class_sections section ON section.course_run_id=run.id
           LEFT JOIN enrolments enrolment ON enrolment.course_run_id=run.id
           WHERE run.institution_id=$1
           GROUP BY run.id ORDER BY run.starts_on DESC,run.code`,
          [institutionId],
        ),
        client.query(
          `SELECT enrolment.id,enrolment.institution_id,enrolment.learner_person_id,
                  concat_ws(' ',person.preferred_name,person.legal_given_names,person.legal_family_name) learner_display_name,
                  enrolment.course_run_id,run.title course_run_title,enrolment.class_section_id,
                  enrolment.cohort_id,enrolment.status,enrolment.enrolled_on,enrolment.effective_from,
                  enrolment.effective_until,enrolment.version
           FROM enrolments enrolment
           JOIN people person ON person.id=enrolment.learner_person_id
           JOIN course_runs run ON run.id=enrolment.course_run_id
           WHERE enrolment.institution_id=$1
           ORDER BY enrolment.created_at DESC LIMIT 100`,
          [institutionId],
        ),
      ]);
      return {
        institutionId,
        programmes: programmes.rows.map((row) => this.camel(row)),
        blueprints: blueprints.rows.map((row) => this.camel(row)),
        outcomes: outcomes.rows.map((row) => this.camel(row)),
        runs: runs.rows.map((row) => this.camel(row)),
        enrolments: enrolments.rows.map((row) => this.camel(row)),
      };
    });
  }

  async createOutcome(institutionId: string, input: CreateOutcomeDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        `INSERT INTO learning_outcomes (
           id,tenant_id,institution_id,code,title,description,outcome_type,level_code,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
        [id, context.tenantId, institutionId, input.code, input.title.trim(), input.description.trim(), input.outcomeType, input.levelCode?.trim() || null, context.actorId],
      );
      await this.record(client, "catalogue.outcome.created", "learning-outcome", id, { institutionId, code: input.code, version: 1 });
      return { id, version: 1 };
    });
  }

  async createProgramme(institutionId: string, input: CreateProgrammeDto) {
    const context = this.context.require(); const programmeId = randomUUID(); const versionId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        `INSERT INTO programmes (id,tenant_id,institution_id,organisational_unit_id,code,title,programme_type,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [programmeId, context.tenantId, institutionId, input.organisationalUnitId ?? null, input.code, input.title.trim(), input.programmeType, context.actorId],
      );
      await client.query(
        `INSERT INTO programme_versions (
           id,tenant_id,institution_id,programme_id,version_number,title,description,credit_value,
           notional_hours,duration_value,duration_unit,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [versionId, context.tenantId, institutionId, programmeId, input.title.trim(), input.description.trim(), input.creditValue ?? null, input.notionalHours ?? null, input.durationValue ?? null, input.durationUnit ?? null, context.actorId],
      );
      await this.record(client, "catalogue.programme.created", "programme-version", versionId, { programmeId, institutionId, code: input.code, version: 1 });
      return { programmeId, versionId, versionNumber: 1, lifecycle: "draft", version: 1 };
    });
  }

  async createBlueprint(institutionId: string, input: CreateBlueprintDto) {
    const context = this.context.require(); const definitionId = randomUUID(); const versionId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const outcomes = await client.query(
        "SELECT id FROM learning_outcomes WHERE institution_id=$1 AND id=ANY($2::uuid[]) AND status='active'",
        [institutionId, input.outcomeIds],
      );
      if (outcomes.rowCount !== new Set(input.outcomeIds).size) throw new BadRequestException("Every mapped outcome must be active in this institution");
      await client.query(
        `INSERT INTO course_definitions (id,tenant_id,institution_id,organisational_unit_id,code,title,subject_area,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [definitionId, context.tenantId, institutionId, input.organisationalUnitId ?? null, input.code, input.title.trim(), input.subjectArea?.trim() || null, context.actorId],
      );
      await client.query(
        `INSERT INTO course_blueprint_versions (
           id,tenant_id,institution_id,course_definition_id,version_number,title,description,
           credit_value,notional_hours,delivery_modes,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$10)`,
        [versionId, context.tenantId, institutionId, definitionId, input.title.trim(), input.description.trim(), input.creditValue ?? null, input.notionalHours ?? null, input.deliveryModes, context.actorId],
      );
      for (const outcomeId of [...new Set(input.outcomeIds)]) {
        await client.query(
          `INSERT INTO blueprint_outcome_mappings (tenant_id,course_blueprint_version_id,learning_outcome_id,coverage_level)
           VALUES ($1,$2,$3,'developed')`,
          [context.tenantId, versionId, outcomeId],
        );
      }
      await this.record(client, "catalogue.blueprint.created", "course-blueprint-version", versionId, { definitionId, institutionId, code: input.code, outcomeCount: outcomes.rowCount, version: 1 });
      return { courseDefinitionId: definitionId, versionId, versionNumber: 1, lifecycle: "draft", version: 1 };
    });
  }

  async approveProgramme(institutionId: string, versionId: string, input: ApproveCurriculumDto) {
    return this.approveVersion("programme_versions", "programme-version", institutionId, versionId, input);
  }

  async approveBlueprint(institutionId: string, versionId: string, input: ApproveCurriculumDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const mappings = await client.query("SELECT 1 FROM blueprint_outcome_mappings WHERE course_blueprint_version_id=$1 LIMIT 1", [versionId]);
      if (!mappings.rowCount) throw new ConflictException("A blueprint requires at least one learning outcome before approval");
      return this.approveVersionWithin(client, "course_blueprint_versions", "course-blueprint-version", institutionId, versionId, input);
    });
  }

  async createRun(institutionId: string, input: CreateRunDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const period = await client.query<PeriodRow>(
        "SELECT starts_on,ends_on,status FROM academic_periods WHERE institution_id=$1 AND id=$2",
        [institutionId, input.academicPeriodId],
      );
      if (!period.rows[0] || period.rows[0].status !== "published") throw new ConflictException("Course runs require a published academic period");
      if (input.startsOn < period.rows[0].starts_on || input.endsOn > period.rows[0].ends_on || input.endsOn < input.startsOn) {
        throw new BadRequestException("Course run dates must be ordered and remain inside the academic period");
      }
      const blueprint = await client.query(
        `SELECT delivery_modes FROM course_blueprint_versions
         WHERE id=$1 AND institution_id=$2 AND lifecycle='approved' AND effective_from <= $3::date
           AND (effective_until IS NULL OR effective_until > $3::date)`,
        [input.blueprintVersionId, institutionId, input.startsOn],
      );
      if (!blueprint.rows[0]) throw new ConflictException("Course runs require an approved blueprint effective on the start date");
      if (!blueprint.rows[0].delivery_modes.includes(input.deliveryMode)) throw new BadRequestException("Delivery mode is not permitted by the approved blueprint");
      await client.query(
        `INSERT INTO course_runs (
           id,tenant_id,institution_id,academic_period_id,course_blueprint_version_id,code,title,
           delivery_mode,starts_on,ends_on,capacity,lifecycle,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled',$12,$12)`,
        [id, context.tenantId, institutionId, input.academicPeriodId, input.blueprintVersionId, input.code.trim(), input.title.trim(), input.deliveryMode, input.startsOn, input.endsOn, input.capacity ?? null, context.actorId],
      );
      await this.record(client, "delivery.course-run.created", "course-run", id, { institutionId, blueprintVersionId: input.blueprintVersionId, lifecycle: "scheduled", version: 1 });
      return { id, lifecycle: "scheduled", version: 1 };
    });
  }

  async createCohort(institutionId: string, input: CreateCohortDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) throw new BadRequestException("Cohort end date must not precede its start date");
      await client.query(
        `INSERT INTO cohorts (id,tenant_id,institution_id,code,title,starts_on,ends_on,status,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)`,
        [id, context.tenantId, institutionId, input.code.trim(), input.title.trim(), input.startsOn ?? null, input.endsOn ?? null, context.actorId],
      );
      await this.record(client, "delivery.cohort.created", "cohort", id, { institutionId, code: input.code, version: 1 });
      return { id, status: "active" };
    });
  }

  async createClass(institutionId: string, input: CreateClassDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const run = await client.query<RunRow>("SELECT * FROM course_runs WHERE id=$1 AND institution_id=$2", [input.courseRunId, institutionId]);
      if (!run.rows[0] || ["completed", "cancelled"].includes(run.rows[0].lifecycle)) throw new ConflictException("Class sections require an active delivery run");
      if (input.cohortId) {
        const cohort = await client.query("SELECT id FROM cohorts WHERE id=$1 AND institution_id=$2 AND status IN ('planned','active')", [input.cohortId, institutionId]);
        if (!cohort.rowCount) throw new BadRequestException("Cohort is unavailable in this institution");
      }
      await client.query(
        `INSERT INTO class_sections (
           id,tenant_id,institution_id,course_run_id,cohort_id,code,title,capacity,status,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$9)`,
        [id, context.tenantId, institutionId, input.courseRunId, input.cohortId ?? null, input.code.trim(), input.title.trim(), input.capacity ?? null, context.actorId],
      );
      await this.record(client, "delivery.class.created", "class-section", id, { institutionId, courseRunId: input.courseRunId, cohortId: input.cohortId, version: 1 });
      return { id, status: "active", version: 1 };
    });
  }

  async enrol(institutionId: string, input: CreateEnrolmentDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await this.requireEligibleLearner(client, institutionId, input.learnerPersonId);
      const run = await this.requireOpenRun(client, institutionId, input.courseRunId);
      await this.validatePlacement(client, institutionId, run, input.classSectionId, input.cohortId);
      const unmet = await client.query(
        `SELECT requisite.required_course_definition_id
         FROM course_requisites requisite
         JOIN course_blueprint_versions current_blueprint ON current_blueprint.id=$1
         WHERE requisite.course_blueprint_version_id=current_blueprint.id
           AND requisite.requisite_type='prerequisite'
           AND NOT EXISTS (
             SELECT 1 FROM enrolments prior
             JOIN course_runs prior_run ON prior_run.id=prior.course_run_id
             JOIN course_blueprint_versions prior_blueprint ON prior_blueprint.id=prior_run.course_blueprint_version_id
             WHERE prior.learner_person_id=$2 AND prior.status='completed'
               AND prior_blueprint.course_definition_id=requisite.required_course_definition_id
           )`,
        [run.course_blueprint_version_id, input.learnerPersonId],
      );
      if (unmet.rowCount) throw new ConflictException("Learner has unmet course prerequisites");
      const activeCount = await client.query<{ count: string } & QueryResultRow>(
        "SELECT count(*)::text count FROM enrolments WHERE course_run_id=$1 AND status='active' AND effective_until IS NULL",
        [run.id],
      );
      const status = run.capacity !== null && Number(activeCount.rows[0].count) >= run.capacity ? "waitlisted" : input.status;
      await client.query(
        `INSERT INTO enrolments (
           id,tenant_id,institution_id,learner_person_id,course_run_id,class_section_id,cohort_id,
           status,enrolled_on,source,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10,$10)`,
        [id, context.tenantId, institutionId, input.learnerPersonId, input.courseRunId, input.classSectionId ?? null, input.cohortId ?? null, status, input.enrolledOn, context.actorId],
      );
      await this.record(client, "enrolment.created", "enrolment", id, { institutionId, learnerPersonId: input.learnerPersonId, courseRunId: input.courseRunId, status, version: 1 });
      return { id, status, version: 1 };
    });
  }

  async transfer(institutionId: string, enrolmentId: string, input: TransferEnrolmentDto) {
    const context = this.context.require(); const replacementId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const currentResult = await client.query<EnrolmentRow>(
        "SELECT id,learner_person_id,course_run_id,status,version FROM enrolments WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [enrolmentId, institutionId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException("Enrolment was not found");
      if (current.version !== input.expectedVersion) throw new ConflictException("Enrolment changed since it was loaded");
      if (!["pending", "active", "waitlisted"].includes(current.status)) throw new ConflictException("Only current enrolments can be transferred");
      const targetRun = await this.requireOpenRun(client, institutionId, input.targetCourseRunId);
      await this.validatePlacement(client, institutionId, targetRun, input.targetClassSectionId, input.targetCohortId);
      await client.query(
        `UPDATE enrolments SET status='withdrawn',effective_until=now(),withdrawal_reason=$3,
           updated_by=$4,updated_at=now(),version=version+1
         WHERE id=$1 AND version=$2`,
        [enrolmentId, input.expectedVersion, `Transferred: ${input.reason.trim()}`, context.actorId],
      );
      await client.query(
        `INSERT INTO enrolments (
           id,tenant_id,institution_id,learner_person_id,course_run_id,class_section_id,cohort_id,
           status,enrolled_on,source,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',current_date,'transfer',$8,$8)`,
        [replacementId, context.tenantId, institutionId, current.learner_person_id, input.targetCourseRunId, input.targetClassSectionId ?? null, input.targetCohortId ?? null, context.actorId],
      );
      await this.record(client, "enrolment.transferred", "enrolment", replacementId, { fromEnrolmentId: enrolmentId, fromCourseRunId: current.course_run_id, toCourseRunId: input.targetCourseRunId, reason: input.reason.trim(), version: 1 });
      return { previousEnrolmentId: enrolmentId, enrolmentId: replacementId, status: "active", version: 1 };
    });
  }

  private async approveVersion(table: "programme_versions", resourceType: string, institutionId: string, versionId: string, input: ApproveCurriculumDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      return this.approveVersionWithin(client, table, resourceType, institutionId, versionId, input);
    });
  }

  private async approveVersionWithin(client: PoolClient, table: "programme_versions" | "course_blueprint_versions", resourceType: string, institutionId: string, versionId: string, input: ApproveCurriculumDto) {
    const context = this.context.require();
    if (input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) throw new BadRequestException("Effective-until must be later than effective-from");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${table}:${versionId}`]);
    const result = await client.query<IdVersionRow>(
      `UPDATE ${table} SET lifecycle='approved',effective_from=$4,effective_until=$5,
         approval_notes=$6,approved_by=$7,approved_at=now(),updated_by=$7,updated_at=now(),version=version+1
       WHERE id=$1 AND institution_id=$2 AND lifecycle IN ('draft','in_review') AND version=$3
       RETURNING id,version`,
      [versionId, institutionId, input.expectedVersion, input.effectiveFrom, input.effectiveUntil ?? null, input.approvalNotes.trim(), context.actorId],
    );
    if (!result.rows[0]) throw new ConflictException("Curriculum version changed or is no longer approvable");
    await this.record(client, `catalogue.${resourceType}.approved`, resourceType, versionId, { institutionId, effectiveFrom: input.effectiveFrom, version: result.rows[0].version });
    return { id: versionId, lifecycle: "approved", version: result.rows[0].version };
  }

  private async requireInstitution(client: PoolClient, institutionId: string) {
    const result = await client.query("SELECT id FROM institutions WHERE id=$1 AND status='active'", [institutionId]);
    if (!result.rowCount) throw new NotFoundException("Active institution was not found");
  }

  private async requireEligibleLearner(client: PoolClient, institutionId: string, personId: string) {
    const result = await client.query(
      `SELECT person.id FROM people person
       JOIN learner_profiles learner ON learner.person_id=person.id
       WHERE person.id=$1 AND learner.institution_id=$2 AND person.status='active'
         AND learner.status IN ('prospective','active')`,
      [personId, institutionId],
    );
    if (!result.rowCount) throw new ConflictException("Learner must have an eligible profile in this institution");
  }

  private async requireOpenRun(client: PoolClient, institutionId: string, runId: string): Promise<RunRow> {
    const result = await client.query<RunRow>(
      `SELECT id,institution_id,capacity,lifecycle,course_blueprint_version_id,starts_on,ends_on
       FROM course_runs WHERE id=$1 AND institution_id=$2 AND lifecycle IN ('scheduled','open','in_progress')`,
      [runId, institutionId],
    );
    if (!result.rows[0]) throw new ConflictException("Target course run is not available for enrolment");
    return result.rows[0];
  }

  private async validatePlacement(client: PoolClient, institutionId: string, run: RunRow, classSectionId?: string, cohortId?: string) {
    if (classSectionId) {
      const section = await client.query(
        "SELECT id FROM class_sections WHERE id=$1 AND institution_id=$2 AND course_run_id=$3 AND status='active'",
        [classSectionId, institutionId, run.id],
      );
      if (!section.rowCount) throw new BadRequestException("Class section does not belong to the selected run");
    }
    if (cohortId) {
      const cohort = await client.query("SELECT id FROM cohorts WHERE id=$1 AND institution_id=$2 AND status IN ('planned','active')", [cohortId, institutionId]);
      if (!cohort.rowCount) throw new BadRequestException("Cohort is unavailable in this institution");
    }
  }

  private camel(row: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
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
