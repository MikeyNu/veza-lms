import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class CatalogueReferenceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async load(institutionId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query(
        "SELECT id FROM institutions WHERE id=$1 AND status='active'",
        [institutionId],
      );
      if (!institution.rowCount) throw new NotFoundException("Active institution was not found");

      const [periods, learners, cohorts, classes] = await Promise.all([
        client.query(
          `SELECT id,code,display_name title,starts_on,ends_on
           FROM academic_periods
           WHERE institution_id=$1 AND status='published'
           ORDER BY starts_on DESC,display_name`,
          [institutionId],
        ),
        client.query(
          `SELECT person.id,
                  concat_ws(' ',person.preferred_name,person.legal_given_names,person.legal_family_name) display_name,
                  learner.status learner_status
           FROM people person
           JOIN learner_profiles learner ON learner.person_id=person.id
           WHERE learner.institution_id=$1 AND person.status='active'
             AND learner.status IN ('prospective','active')
           ORDER BY person.legal_family_name,person.legal_given_names`,
          [institutionId],
        ),
        client.query(
          `SELECT id,code,title,status FROM cohorts
           WHERE institution_id=$1 AND status IN ('planned','active')
           ORDER BY title`,
          [institutionId],
        ),
        client.query(
          `SELECT id,course_run_id,cohort_id,code,title,status,version
           FROM class_sections
           WHERE institution_id=$1 AND status IN ('planned','active')
           ORDER BY title`,
          [institutionId],
        ),
      ]);

      return {
        academicPeriods: periods.rows.map((row) => ({
          id: row.id,
          code: row.code,
          title: row.title,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
        })),
        eligibleLearners: learners.rows.map((row) => ({
          id: row.id,
          displayName: row.display_name.trim(),
          learnerStatus: row.learner_status,
        })),
        cohorts: cohorts.rows,
        classes: classes.rows.map((row) => ({
          id: row.id,
          courseRunId: row.course_run_id,
          cohortId: row.cohort_id ?? undefined,
          code: row.code,
          title: row.title,
          status: row.status,
          version: row.version,
        })),
      };
    });
  }
}
