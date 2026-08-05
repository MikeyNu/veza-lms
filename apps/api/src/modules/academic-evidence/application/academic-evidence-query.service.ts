import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class AcademicEvidenceQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async workspace(institutionId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [
        assignments,
        submissions,
        gradebooks,
        certificates,
        exports,
        rubrics,
        groups,
        templates,
        awardRules,
      ] = await Promise.all([
        client.query(
          `SELECT a.id,a.course_run_id "courseRunId",r.title "courseRunTitle",a.title,
                  a.due_at "dueAt",a.status,a.group_mode "groupMode",
                  a.max_attempts "maxAttempts",a.allowed_formats "allowedFormats",a.version,
                  ar.rubric_id "rubricId",rubric.title "rubricTitle",
                  count(DISTINCT s.id)::int "submissionCount",
                  count(DISTINCT g.id)::int "groupCount"
           FROM assignments a
           JOIN course_runs r ON r.id=a.course_run_id
           LEFT JOIN assignment_rubrics ar ON ar.assignment_id=a.id
           LEFT JOIN rubrics rubric ON rubric.id=ar.rubric_id
           LEFT JOIN submission_attempts s
             ON s.assignment_id=a.id AND s.status IN ('submitted','accepted')
           LEFT JOIN assignment_groups g ON g.assignment_id=a.id AND g.status='active'
           WHERE a.institution_id=$1
           GROUP BY a.id,r.title,ar.rubric_id,rubric.title
           ORDER BY a.updated_at DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT s.id,s.assignment_id "assignmentId",a.title "assignmentTitle",
                  s.enrolment_id "enrolmentId",p.display_name "learnerName",
                  s.attempt_number "attemptNumber",s.status,s.submitted_at "submittedAt",
                  s.receipt_number "receiptNumber",s.receipt_checksum "receiptChecksum",
                  s.is_late "isLate",s.assignment_group_id "assignmentGroupId",
                  count(DISTINCT f.id)::int "fileCount",
                  COALESCE(bool_and(f.scan_status='clean'),true) "allFilesClean",
                  mark.id "markId",mark.score,mark.status "markStatus",
                  mark.feedback,mark.rubric_scores "rubricScores",mark.version "markVersion",
                  mark.released_at "releasedAt"
           FROM submission_attempts s
           JOIN assignments a ON a.id=s.assignment_id
           JOIN people p ON p.id=s.learner_person_id
           LEFT JOIN submission_files f ON f.submission_attempt_id=s.id
           LEFT JOIN LATERAL (
             SELECT m.* FROM submission_marks m
             WHERE m.submission_attempt_id=s.id AND m.status<>'superseded'
             ORDER BY m.created_at DESC LIMIT 1
           ) mark ON true
           WHERE s.institution_id=$1
           GROUP BY s.id,a.title,p.display_name,mark.id,mark.score,mark.status,
                    mark.feedback,mark.rubric_scores,mark.version,mark.released_at
           ORDER BY s.created_at DESC LIMIT 250`,
          [institutionId],
        ),
        client.query(
          `SELECT r.id "courseRunId",r.title "courseRunTitle",
                  count(DISTINCT i.id)::int "itemCount",
                  count(DISTINCT g.id) FILTER (WHERE g.state='published')::int "publishedResultCount",
                  count(DISTINCT e.id) FILTER (WHERE e.status='active' AND e.effective_until IS NULL)::int "activeLearnerCount",
                  f.id "activeFormulaId",f.version_number "formulaVersion",f.impact_preview "impactPreview"
           FROM course_runs r
           LEFT JOIN gradebook_items i ON i.course_run_id=r.id
           LEFT JOIN learner_grade_results g ON g.gradebook_item_id=i.id
           LEFT JOIN enrolments e ON e.course_run_id=r.id
           LEFT JOIN gradebook_formula_versions f ON f.course_run_id=r.id AND f.status='active'
           WHERE r.institution_id=$1
           GROUP BY r.id,f.id,f.version_number,f.impact_preview
           ORDER BY r.starts_on DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT c.id,c.verification_code "verificationCode",c.status,c.issued_at "issuedAt",
                  p.display_name "learnerName",c.payload,c.revocation_reason "revocationReason",
                  c.award_evaluation_id "awardEvaluationId"
           FROM issued_certificates c
           JOIN people p ON p.id=c.learner_person_id
           WHERE c.institution_id=$1
           ORDER BY c.issued_at DESC LIMIT 250`,
          [institutionId],
        ),
        client.query(
          `SELECT id,export_type "exportType",format,status,row_count "rowCount",checksum,
                  requested_at "requestedAt",ready_at "readyAt",expires_at "expiresAt"
           FROM export_jobs
           WHERE institution_id=$1 OR institution_id IS NULL
           ORDER BY requested_at DESC LIMIT 100`,
          [institutionId],
        ),
        client.query(
          `SELECT r.id,r.title,r.status,r.version,r.submitted_at "submittedAt",
                  r.approved_at "approvedAt",r.approval_notes "approvalNotes",
                  COALESCE(jsonb_agg(jsonb_build_object(
                    'criterionId',c.criterion_id,'sequenceNumber',c.sequence_number,
                    'title',c.title,'description',c.description,
                    'maximumScore',c.maximum_score,'levels',c.levels
                  ) ORDER BY c.sequence_number) FILTER (WHERE c.criterion_id IS NOT NULL),'[]'::jsonb) criteria
           FROM rubrics r LEFT JOIN rubric_criteria c ON c.rubric_id=r.id
           WHERE r.institution_id=$1
           GROUP BY r.id ORDER BY r.created_at DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT g.id,g.assignment_id "assignmentId",a.title "assignmentTitle",g.name,g.status,
                  COALESCE(jsonb_agg(jsonb_build_object(
                    'learnerPersonId',m.learner_person_id,'learnerName',p.display_name,
                    'joinedAt',m.joined_at,'leftAt',m.left_at
                  ) ORDER BY p.display_name) FILTER (WHERE m.learner_person_id IS NOT NULL),'[]'::jsonb) members
           FROM assignment_groups g
           JOIN assignments a ON a.id=g.assignment_id
           LEFT JOIN assignment_group_members m ON m.assignment_group_id=g.id
           LEFT JOIN people p ON p.id=m.learner_person_id
           WHERE a.institution_id=$1
           GROUP BY g.id,a.title ORDER BY g.created_at DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT id,title,status,version,submitted_at "submittedAt",approved_at "approvedAt",
                  approval_notes "approvalNotes",document_schema "documentSchema"
           FROM certificate_templates WHERE institution_id=$1 ORDER BY updated_at DESC,id`,
          [institutionId],
        ),
        client.query(
          `SELECT r.id,r.template_id "templateId",t.title "templateTitle",
                  r.programme_id "programmeId",r.course_definition_id "courseDefinitionId",
                  r.rule_schema "ruleSchema",r.status,r.version,
                  count(e.id)::int "evaluationCount",
                  count(e.id) FILTER (WHERE e.eligible)::int "eligibleCount"
           FROM certificate_award_rules r
           JOIN certificate_templates t ON t.id=r.template_id
           LEFT JOIN award_rule_evaluations e ON e.award_rule_id=r.id
           WHERE r.institution_id=$1
           GROUP BY r.id,t.title ORDER BY r.created_at DESC,r.id`,
          [institutionId],
        ),
      ]);
      return {
        institutionId,
        assignments: assignments.rows,
        submissions: submissions.rows,
        gradebooks: gradebooks.rows,
        certificates: certificates.rows,
        exports: exports.rows,
        rubrics: rubrics.rows,
        assignmentGroups: groups.rows,
        certificateTemplates: templates.rows,
        awardRules: awardRules.rows,
      };
    });
  }

  async learnerAssignments() {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learner = await client.query<{ id: string }>(
        `SELECT p.id FROM people p
         JOIN learner_profiles lp ON lp.person_id=p.id
         WHERE p.linked_user_id=$1 AND p.status='active' AND lp.status IN ('active','applicant')
         ORDER BY lp.created_at DESC LIMIT 1`,
        [context.actorId],
      );
      const learnerPersonId = learner.rows[0]?.id;
      if (!learnerPersonId) throw new NotFoundException("Learner profile is not linked to this identity");
      const assignments = await client.query(
        `SELECT a.id,a.title,a.instructions,a.due_at "dueAt",a.late_policy "latePolicy",
                a.group_mode "groupMode",a.allowed_formats "allowedFormats",
                a.max_attempts "maxAttempts",run.title "courseTitle",
                e.id "enrolmentId",e.course_run_id "courseRunId",
                grp.id "assignmentGroupId",grp.name "assignmentGroupName",
                attempt.id "latestAttemptId",attempt.attempt_number "latestAttemptNumber",
                attempt.status "latestAttemptStatus",attempt.receipt_number "receiptNumber",
                attempt.receipt_checksum "receiptChecksum",attempt.submitted_at "submittedAt",
                attempt.is_late "isLate",mark.score "releasedScore",mark.feedback "releasedFeedback",
                mark.released_at "resultReleasedAt",
                COALESCE(attempts.attempt_count,0)::int "attemptCount"
         FROM enrolments e
         JOIN course_runs run ON run.id=e.course_run_id
         JOIN assignments a ON a.course_run_id=e.course_run_id AND a.status='published'
         LEFT JOIN LATERAL (
           SELECT g.id,g.name
           FROM assignment_groups g
           JOIN assignment_group_members m ON m.assignment_group_id=g.id
           WHERE g.assignment_id=a.id AND g.status='active'
             AND m.learner_person_id=$1 AND m.left_at IS NULL
           ORDER BY m.joined_at DESC LIMIT 1
         ) grp ON true
         LEFT JOIN LATERAL (
           SELECT s.* FROM submission_attempts s
           WHERE s.assignment_id=a.id AND s.enrolment_id=e.id
           ORDER BY s.attempt_number DESC LIMIT 1
         ) attempt ON true
         LEFT JOIN LATERAL (
           SELECT count(*)::int attempt_count FROM submission_attempts s
           WHERE s.assignment_id=a.id AND s.enrolment_id=e.id
         ) attempts ON true
         LEFT JOIN LATERAL (
           SELECT m.score,m.feedback,m.released_at
           FROM submission_marks m
           WHERE m.submission_attempt_id=attempt.id AND m.status='released'
           ORDER BY m.created_at DESC LIMIT 1
         ) mark ON true
         WHERE e.learner_person_id=$1 AND e.status='active' AND e.effective_until IS NULL
         ORDER BY a.due_at NULLS LAST,a.title`,
        [learnerPersonId],
      );
      return { learnerPersonId, assignments: assignments.rows, generatedAt: new Date().toISOString() };
    });
  }

  async learnerGradebook(courseRunId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const enrolment = await client.query<{ id: string; course_title: string }>(
        `SELECT e.id,run.title course_title
         FROM enrolments e JOIN course_runs run ON run.id=e.course_run_id
         JOIN people p ON p.id=e.learner_person_id
         WHERE e.course_run_id=$1 AND e.status IN ('active','completed')
           AND p.linked_user_id=$2
         ORDER BY e.created_at DESC LIMIT 1`,
        [courseRunId, context.actorId],
      );
      const current = enrolment.rows[0];
      if (!current) throw new NotFoundException("Learner gradebook was not found");
      const results = await client.query(
        `SELECT item.id "gradebookItemId",item.title,item.maximum_score "maximumScore",
                item.weight,item.rounding_mode "roundingMode",item.decimal_places "decimalPlaces",
                result.calculated_score "score",result.override_score "overrideScore",
                result.is_missing "isMissing",result.is_excluded "isExcluded",
                result.is_exempt "isExempt",result.published_at "publishedAt"
         FROM gradebook_items item
         LEFT JOIN learner_grade_results result
           ON result.gradebook_item_id=item.id AND result.enrolment_id=$2 AND result.state='published'
         WHERE item.course_run_id=$1 AND item.status<>'retired'
         ORDER BY item.title`,
        [courseRunId, current.id],
      );
      return {
        courseRunId,
        courseTitle: current.course_title,
        enrolmentId: current.id,
        mode: "learner",
        results: results.rows,
      };
    });
  }

  async staffGradebook(courseRunId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const run = await client.query<{ title: string }>("SELECT title FROM course_runs WHERE id=$1", [courseRunId]);
      if (!run.rows[0]) throw new NotFoundException("Course run was not found");
      const rows = await client.query(
        `SELECT e.id "enrolmentId",p.display_name "learnerName",
                item.id "gradebookItemId",item.title "itemTitle",item.maximum_score "maximumScore",
                result.id "resultId",result.state,result.calculated_score "score",
                result.override_score "overrideScore",result.is_missing "isMissing",
                result.is_excluded "isExcluded",result.is_exempt "isExempt",
                result.version,result.published_at "publishedAt"
         FROM enrolments e
         JOIN people p ON p.id=e.learner_person_id
         CROSS JOIN gradebook_items item
         LEFT JOIN learner_grade_results result
           ON result.enrolment_id=e.id AND result.gradebook_item_id=item.id AND result.state<>'corrected'
         WHERE e.course_run_id=$1 AND item.course_run_id=$1
         ORDER BY p.display_name,item.title`,
        [courseRunId],
      );
      return { courseRunId, courseTitle: run.rows[0].title, mode: "staff", rows: rows.rows };
    });
  }
}
