import { Injectable, NotFoundException } from "@nestjs/common";
import type { CatalogueWorkspace } from "@veza/contracts";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class CatalogueWorkspaceQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async load(institutionId: string): Promise<CatalogueWorkspace> {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query(
        "SELECT id FROM institutions WHERE id=$1 AND status='active'",
        [institutionId],
      );
      if (!institution.rowCount) throw new NotFoundException("Active institution was not found");
      const [programmes, blueprints, outcomes, runs, enrolments] = await Promise.all([
        client.query(
          `SELECT version.id,programme.id programme_id,programme.institution_id,programme.code,
                  version.title,programme.programme_type,version.version_number,version.lifecycle,
                  version.credit_value,version.notional_hours,version.duration_value,version.duration_unit,
                  version.effective_from,version.effective_until,version.submitted_at,version.approved_at,
                  version.approval_review_id,version.version,
                  count(link.course_blueprint_version_id)::int course_count
           FROM programme_versions version
           JOIN programmes programme ON programme.id=version.programme_id
           LEFT JOIN programme_version_courses link ON link.programme_version_id=version.id
           WHERE programme.institution_id=$1
           GROUP BY version.id,programme.id
           ORDER BY programme.code,version.version_number DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT version.id,definition.id course_definition_id,
                  definition.parent_definition_id,definition.institution_id,definition.code,
                  definition.definition_type,version.title,definition.subject_area,
                  version.version_number,version.lifecycle,version.credit_value,
                  version.notional_hours,version.delivery_modes,version.effective_from,
                  version.effective_until,version.submitted_at,version.approved_at,
                  version.approval_review_id,version.version,
                  count(DISTINCT mapping.learning_outcome_id)::int outcome_count,
                  count(DISTINCT requisite.required_course_definition_id)::int requisite_count
           FROM course_blueprint_versions version
           JOIN course_definitions definition ON definition.id=version.course_definition_id
           LEFT JOIN blueprint_outcome_mappings mapping
             ON mapping.course_blueprint_version_id=version.id
           LEFT JOIN course_requisites requisite
             ON requisite.course_blueprint_version_id=version.id
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
                  count(DISTINCT enrolment.id) FILTER (
                    WHERE enrolment.status='active' AND enrolment.effective_until IS NULL
                  )::int active_enrolment_count
           FROM course_runs run
           LEFT JOIN class_sections section ON section.course_run_id=run.id
           LEFT JOIN enrolments enrolment ON enrolment.course_run_id=run.id
           WHERE run.institution_id=$1
           GROUP BY run.id ORDER BY run.starts_on DESC,run.code`,
          [institutionId],
        ),
        client.query(
          `SELECT enrolment.id,enrolment.institution_id,enrolment.learner_person_id,
                  concat_ws(' ',person.preferred_name,person.legal_given_names,
                            person.legal_family_name) learner_display_name,
                  enrolment.course_run_id,run.title course_run_title,
                  enrolment.class_section_id,enrolment.cohort_id,enrolment.status,
                  enrolment.enrolled_on,enrolment.effective_from,enrolment.effective_until,
                  enrolment.version
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
      } as CatalogueWorkspace;
    });
  }

  private camel(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        value,
      ]),
    );
  }
}
