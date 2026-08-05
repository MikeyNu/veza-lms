import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class AcademicEvidenceQueryService {
  constructor(private readonly database: DatabaseService, private readonly context: TenantContext) {}

  async workspace(institutionId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [assignments, submissions, gradebooks, certificates, exports] = await Promise.all([
        client.query(
          `SELECT a.id,a.course_run_id "courseRunId",r.title "courseRunTitle",a.title,a.due_at "dueAt",
                  a.status,a.group_mode "groupMode",a.max_attempts "maxAttempts",a.allowed_formats "allowedFormats",a.version,
                  count(s.id)::int "submissionCount"
           FROM assignments a JOIN course_runs r ON r.id=a.course_run_id
           LEFT JOIN submission_attempts s ON s.assignment_id=a.id AND s.status IN ('submitted','accepted')
           WHERE a.institution_id=$1 GROUP BY a.id,r.title ORDER BY a.updated_at DESC`, [institutionId]),
        client.query(
          `SELECT s.id,s.assignment_id "assignmentId",a.title "assignmentTitle",s.enrolment_id "enrolmentId",
                  p.display_name "learnerName",s.attempt_number "attemptNumber",s.status,s.submitted_at "submittedAt",
                  s.receipt_number "receiptNumber",s.receipt_checksum "receiptChecksum",s.is_late "isLate",
                  count(f.id)::int "fileCount",bool_and(f.scan_status='clean') "allFilesClean"
           FROM submission_attempts s JOIN assignments a ON a.id=s.assignment_id
           JOIN people p ON p.id=s.learner_person_id LEFT JOIN submission_files f ON f.submission_attempt_id=s.id
           WHERE s.institution_id=$1 GROUP BY s.id,a.title,p.display_name ORDER BY s.created_at DESC LIMIT 250`, [institutionId]),
        client.query(
          `SELECT r.id "courseRunId",r.title "courseRunTitle",count(DISTINCT i.id)::int "itemCount",
                  count(DISTINCT g.id) FILTER (WHERE g.state='published')::int "publishedResultCount",
                  f.id "activeFormulaId",f.version_number "formulaVersion"
           FROM course_runs r LEFT JOIN gradebook_items i ON i.course_run_id=r.id
           LEFT JOIN learner_grade_results g ON g.gradebook_item_id=i.id
           LEFT JOIN gradebook_formula_versions f ON f.course_run_id=r.id AND f.status='active'
           WHERE r.institution_id=$1 GROUP BY r.id,f.id,f.version_number ORDER BY r.starts_on DESC`, [institutionId]),
        client.query(
          `SELECT c.id,c.verification_code "verificationCode",c.status,c.issued_at "issuedAt",
                  p.display_name "learnerName",c.payload,c.revocation_reason "revocationReason"
           FROM issued_certificates c JOIN people p ON p.id=c.learner_person_id
           WHERE c.institution_id=$1 ORDER BY c.issued_at DESC LIMIT 250`, [institutionId]),
        client.query(
          `SELECT id,export_type "exportType",format,status,row_count "rowCount",checksum,
                  requested_at "requestedAt",ready_at "readyAt",expires_at "expiresAt"
           FROM export_jobs WHERE institution_id=$1 OR institution_id IS NULL ORDER BY requested_at DESC LIMIT 100`, [institutionId]),
      ]);
      return { institutionId, assignments: assignments.rows, submissions: submissions.rows, gradebooks: gradebooks.rows, certificates: certificates.rows, exports: exports.rows };
    });
  }
}
