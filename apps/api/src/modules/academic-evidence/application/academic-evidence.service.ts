import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  ActivateFormulaDto,
  AddAccommodationDto,
  AllocateMarkerDto,
  CompleteExportDto,
  CreateAssignmentDto,
  CreateAwardRuleDto,
  CreateCertificateTemplateDto,
  CreateFormulaVersionDto,
  CreateGradeCategoryDto,
  CreateGradeItemDto,
  FinalizeSubmissionDto,
  IssueCertificateDto,
  OverrideGradeDto,
  PublishAssignmentDto,
  PublishGradeDto,
  RecordMarkDto,
  RecordScanDto,
  RegisterSubmissionFileDto,
  RequestExportDto,
  RevokeCertificateDto,
  StartSubmissionDto,
  UpdateUploadOffsetDto,
} from "./academic-evidence.dto.js";

interface AssignmentRow extends QueryResultRow {
  id: string;
  institution_id: string;
  course_run_id: string;
  due_at: string | null;
  late_policy: Record<string, unknown>;
  max_attempts: number;
  status: string;
  version: number;
}
interface AttemptRow extends QueryResultRow {
  id: string;
  institution_id: string;
  assignment_id: string;
  enrolment_id: string;
  learner_person_id: string;
  attempt_number: number;
  status: string;
}

@Injectable()
export class AcademicEvidenceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createAssignment(institutionId: string, input: CreateAssignmentDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const run = await client.query(
        "SELECT id FROM course_runs WHERE id=$1 AND institution_id=$2 AND lifecycle NOT IN ('completed','cancelled')",
        [input.courseRunId, institutionId],
      );
      if (!run.rowCount) throw new BadRequestException("Assignment requires an active course run");
      const id = randomUUID();
      await client.query(
        `INSERT INTO assignments (
          id,tenant_id,institution_id,course_run_id,title,instructions,due_at,late_policy,group_mode,
          allowed_formats,max_attempts,created_by,updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [id, context.tenantId, institutionId, input.courseRunId, input.title.trim(), input.instructions,
          input.dueAt ?? null, input.latePolicy, input.groupMode, input.allowedFormats, input.maxAttempts,
          context.actorId],
      );
      await this.record(client, "assessment.assignment.created", "assignment", id, { institutionId, courseRunId: input.courseRunId, version: 1 });
      return { id, version: 1 };
    });
  }

  async publishAssignment(institutionId: string, assignmentId: string, input: PublishAssignmentDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const assignment = await client.query<AssignmentRow>(
        "SELECT * FROM assignments WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [assignmentId, institutionId],
      );
      const current = assignment.rows[0];
      if (!current) throw new NotFoundException("Assignment was not found");
      if (current.status !== "draft") throw new ConflictException("Only draft assignments can be published");
      if (current.version !== input.expectedVersion) throw new ConflictException("Assignment changed since it was loaded");
      const updated = await client.query<{ version: number } & QueryResultRow>(
        "UPDATE assignments SET status='published',version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND version=$2 RETURNING version",
        [assignmentId, input.expectedVersion, context.actorId],
      );
      await this.record(client, "assessment.assignment.published", "assignment", assignmentId, { reason: input.reason.trim(), version: updated.rows[0].version });
      return { id: assignmentId, status: "published", version: updated.rows[0].version };
    });
  }

  async addAccommodation(institutionId: string, assignmentId: string, input: AddAccommodationDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const eligible = await client.query(
        `SELECT 1 FROM assignments a
         JOIN enrolments e ON e.course_run_id=a.course_run_id AND e.learner_person_id=$3
         WHERE a.id=$1 AND a.institution_id=$2 AND e.status IN ('active','pending') AND e.effective_until IS NULL`,
        [assignmentId, institutionId, input.learnerPersonId],
      );
      if (!eligible.rowCount) throw new BadRequestException("Accommodation requires a current learner enrolment");
      const id = randomUUID();
      await client.query(
        `INSERT INTO assignment_accommodations (
          id,tenant_id,assignment_id,learner_person_id,due_at_override,extra_attempts,format_overrides,reason,approved_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_id,assignment_id,learner_person_id) DO UPDATE SET
          due_at_override=EXCLUDED.due_at_override,extra_attempts=EXCLUDED.extra_attempts,
          format_overrides=EXCLUDED.format_overrides,reason=EXCLUDED.reason,approved_by=EXCLUDED.approved_by`,
        [id, context.tenantId, assignmentId, input.learnerPersonId, input.dueAtOverride ?? null,
          input.extraAttempts, input.formatOverrides ?? null, input.reason.trim(), context.actorId],
      );
      await this.record(client, "assessment.accommodation.recorded", "assignment", assignmentId, { learnerPersonId: input.learnerPersonId, version: 1 });
      return { assignmentId, learnerPersonId: input.learnerPersonId };
    });
  }

  async startSubmission(input: StartSubmissionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<AssignmentRow & { learner_person_id: string; institution_id: string }>(
        `SELECT a.*,e.learner_person_id,e.institution_id
         FROM assignments a JOIN enrolments e ON e.id=$2 AND e.course_run_id=a.course_run_id
         WHERE a.id=$1 AND a.status='published' AND e.status='active' AND e.effective_until IS NULL FOR UPDATE`,
        [input.assignmentId, input.enrolmentId],
      );
      const assignment = result.rows[0];
      if (!assignment) throw new BadRequestException("Published assignment and active enrolment were not found");
      const accommodation = await client.query<{ extra_attempts: number } & QueryResultRow>(
        "SELECT extra_attempts FROM assignment_accommodations WHERE assignment_id=$1 AND learner_person_id=$2",
        [input.assignmentId, assignment.learner_person_id],
      );
      const attempts = await client.query<{ count: string } & QueryResultRow>(
        "SELECT count(*)::text AS count FROM submission_attempts WHERE assignment_id=$1 AND enrolment_id=$2",
        [input.assignmentId, input.enrolmentId],
      );
      const nextAttempt = Number(attempts.rows[0].count) + 1;
      if (nextAttempt > assignment.max_attempts + Number(accommodation.rows[0]?.extra_attempts ?? 0)) {
        throw new ConflictException("Attempt allowance has been exhausted");
      }
      if (input.supersedesAttemptId) {
        const previous = await client.query("SELECT 1 FROM submission_attempts WHERE id=$1 AND assignment_id=$2 AND enrolment_id=$3", [input.supersedesAttemptId, input.assignmentId, input.enrolmentId]);
        if (!previous.rowCount) throw new BadRequestException("Superseded attempt was not found");
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO submission_attempts (
          id,tenant_id,institution_id,assignment_id,enrolment_id,learner_person_id,attempt_number,supersedes_attempt_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, context.tenantId, assignment.institution_id, input.assignmentId, input.enrolmentId,
          assignment.learner_person_id, nextAttempt, input.supersedesAttemptId ?? null],
      );
      return { id, attemptNumber: nextAttempt, status: "draft" };
    });
  }

  async registerFile(attemptId: string, input: RegisterSubmissionFileDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const attempt = await client.query("SELECT 1 FROM submission_attempts WHERE id=$1 AND status IN ('draft','uploading')", [attemptId]);
      if (!attempt.rowCount) throw new ConflictException("Submission attempt is not accepting files");
      const id = randomUUID();
      await client.query(
        `INSERT INTO submission_files (
          id,tenant_id,submission_attempt_id,file_name,object_key,media_type,byte_size,checksum,upload_session_id,upload_offset
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, context.tenantId, attemptId, input.fileName.trim(), input.objectKey, input.mediaType,
          input.byteSize, input.checksum, input.uploadSessionId, input.uploadOffset],
      );
      await client.query("UPDATE submission_attempts SET status='uploading' WHERE id=$1", [attemptId]);
      return { id, uploadOffset: input.uploadOffset, scanStatus: "pending" };
    });
  }

  async updateUploadOffset(fileId: string, input: UpdateUploadOffsetDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const updated = await client.query(
        `UPDATE submission_files SET upload_offset=$3
         WHERE id=$1 AND upload_session_id=$2 AND upload_offset <= $3 RETURNING id,upload_offset`,
        [fileId, input.uploadSessionId, input.uploadOffset],
      );
      if (!updated.rowCount) throw new ConflictException("Upload session or offset is stale");
      return updated.rows[0];
    });
  }

  async recordScan(fileId: string, input: RecordScanDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const updated = await client.query(
        "UPDATE submission_files SET scan_status=$2,scan_evidence=$3 WHERE id=$1 RETURNING submission_attempt_id",
        [fileId, input.scanStatus, input.scanEvidence],
      );
      if (!updated.rowCount) throw new NotFoundException("Submission file was not found");
      if (input.scanStatus === "infected") {
        await client.query("UPDATE submission_attempts SET status='quarantined' WHERE id=$1", [updated.rows[0].submission_attempt_id]);
      }
      return { id: fileId, scanStatus: input.scanStatus };
    });
  }

  async finalizeSubmission(attemptId: string, input: FinalizeSubmissionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<AttemptRow & { due_at: string | null }>(
        `SELECT s.*,a.due_at FROM submission_attempts s JOIN assignments a ON a.id=s.assignment_id
         WHERE s.id=$1 FOR UPDATE`, [attemptId],
      );
      const attempt = result.rows[0];
      if (!attempt) throw new NotFoundException("Submission attempt was not found");
      if (!["draft", "uploading"].includes(attempt.status)) throw new ConflictException("Submission attempt cannot be finalised");
      const unsafe = await client.query("SELECT 1 FROM submission_files WHERE submission_attempt_id=$1 AND scan_status<>'clean' LIMIT 1", [attemptId]);
      if (unsafe.rowCount) throw new ConflictException("All submission files must pass malware scanning");
      const submittedAt = new Date().toISOString();
      const receiptNumber = `VZ-${new Date().getUTCFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`;
      const checksum = createHash("sha256").update(JSON.stringify({ attemptId, assignmentId: attempt.assignment_id, enrolmentId: attempt.enrolment_id, attemptNumber: attempt.attempt_number, submittedAt, content: input.contentSnapshot })).digest("hex");
      const isLate = Boolean(attempt.due_at && Date.parse(submittedAt) > Date.parse(attempt.due_at));
      await client.query(
        `UPDATE submission_attempts SET status='submitted',submitted_at=$2,receipt_number=$3,
          receipt_checksum=$4,content_snapshot=$5,is_late=$6 WHERE id=$1`,
        [attemptId, submittedAt, receiptNumber, checksum, input.contentSnapshot, isLate],
      );
      await this.record(client, "assessment.submission.finalised", "submission-attempt", attemptId, { receiptNumber, receiptChecksum: checksum, isLate, version: attempt.attempt_number });
      return { attemptId, receiptNumber, receiptChecksum: checksum, submittedAt, isLate };
    });
  }

  async allocateMarker(attemptId: string, input: AllocateMarkerDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const eligible = await client.query(
        `SELECT 1 FROM submission_attempts s
         JOIN assignments a ON a.id=s.assignment_id
         JOIN staff_profiles sp ON sp.person_id=$2 AND sp.institution_id=a.institution_id
         WHERE s.id=$1 AND s.status IN ('submitted','accepted') AND sp.status='active'`,
        [attemptId, input.markerPersonId],
      );
      if (!eligible.rowCount) throw new BadRequestException("Marker requires an active staff profile in the assignment institution");
      const id = randomUUID();
      await client.query(
        `INSERT INTO marker_allocations (id,tenant_id,submission_attempt_id,marker_person_id,allocation_role,allocated_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, context.tenantId, attemptId, input.markerPersonId, input.allocationRole, context.actorId],
      );
      await this.record(client, "assessment.marker.allocated", "submission-attempt", attemptId, { markerPersonId: input.markerPersonId, allocationRole: input.allocationRole, version: 1 });
      return { id };
    });
  }

  async recordMark(attemptId: string, input: RecordMarkDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const allocation = await client.query(
        "SELECT 1 FROM marker_allocations WHERE id=$1 AND submission_attempt_id=$2 AND status IN ('allocated','accepted')",
        [input.markerAllocationId, attemptId],
      );
      if (!allocation.rowCount) throw new BadRequestException("Active marker allocation was not found");
      const id = randomUUID();
      await client.query(
        `INSERT INTO submission_marks (
          id,tenant_id,submission_attempt_id,marker_allocation_id,score,rubric_scores,feedback,status,created_by,supersedes_mark_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, context.tenantId, attemptId, input.markerAllocationId, input.score, input.rubricScores,
          input.feedback, input.status, context.actorId, input.supersedesMarkId ?? null],
      );
      if (input.supersedesMarkId) await client.query("UPDATE submission_marks SET status='superseded' WHERE id=$1", [input.supersedesMarkId]);
      if (input.status !== "draft") await client.query("UPDATE marker_allocations SET status='completed',completed_at=now() WHERE id=$1", [input.markerAllocationId]);
      await this.record(client, "assessment.mark.recorded", "submission-mark", id, { attemptId, score: input.score, status: input.status, version: 1 });
      return { id, status: input.status };
    });
  }

  async createCategory(institutionId: string, input: CreateGradeCategoryDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO gradebook_categories (id,tenant_id,institution_id,course_run_id,title,weight,sequence_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, context.tenantId, institutionId, input.courseRunId, input.title.trim(), input.weight, input.sequenceNumber],
      );
      return { id };
    });
  }

  async createGradeItem(institutionId: string, input: CreateGradeItemDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO gradebook_items (
          id,tenant_id,institution_id,course_run_id,category_id,assignment_id,title,maximum_score,weight,
          missing_policy,rounding_mode,decimal_places
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, context.tenantId, institutionId, input.courseRunId, input.categoryId ?? null,
          input.assignmentId ?? null, input.title.trim(), input.maximumScore, input.weight ?? null,
          input.missingPolicy, input.roundingMode, input.decimalPlaces],
      );
      return { id };
    });
  }

  async createFormulaVersion(input: CreateFormulaVersionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const previous = await client.query("SELECT COALESCE(max(version_number),0)+1 AS next FROM gradebook_formula_versions WHERE course_run_id=$1", [input.courseRunId]);
      const impact = await this.previewFormula(client, input.courseRunId, input.formula);
      const id = randomUUID();
      await client.query(
        `INSERT INTO gradebook_formula_versions (
          id,tenant_id,course_run_id,version_number,formula,impact_preview,created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, context.tenantId, input.courseRunId, Number(previous.rows[0].next), input.formula, impact, context.actorId],
      );
      return { id, versionNumber: Number(previous.rows[0].next), impactPreview: impact };
    });
  }

  async activateFormula(formulaId: string, input: ActivateFormulaDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const formula = await client.query("SELECT course_run_id,created_by FROM gradebook_formula_versions WHERE id=$1 AND status='draft' FOR UPDATE", [formulaId]);
      if (!formula.rowCount) throw new NotFoundException("Draft formula version was not found");
      if (formula.rows[0].created_by === context.actorId) throw new ConflictException("Formula activation requires an independent approver");
      await client.query("UPDATE gradebook_formula_versions SET status='retired' WHERE course_run_id=$1 AND status='active'", [formula.rows[0].course_run_id]);
      await client.query("UPDATE gradebook_formula_versions SET status='active',approved_by=$2,approved_at=now() WHERE id=$1", [formulaId, context.actorId]);
      await this.record(client, "gradebook.formula.activated", "gradebook-formula", formulaId, { reason: input.reason.trim(), version: 1 });
      return { id: formulaId, status: "active" };
    });
  }

  async overrideGrade(input: OverrideGradeDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const previous = await client.query("SELECT id FROM learner_grade_results WHERE enrolment_id=$1 AND gradebook_item_id=$2 AND state<>'corrected' FOR UPDATE", [input.enrolmentId, input.gradebookItemId]);
      if (previous.rowCount) await client.query("UPDATE learner_grade_results SET state='corrected' WHERE id=$1", [previous.rows[0].id]);
      const id = randomUUID();
      await client.query(
        `INSERT INTO learner_grade_results (
          id,tenant_id,enrolment_id,gradebook_item_id,override_score,override_reason,state,supersedes_result_id,created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8)`,
        [id, context.tenantId, input.enrolmentId, input.gradebookItemId, input.score, input.reason.trim(), previous.rows[0]?.id ?? null, context.actorId],
      );
      await this.record(client, "gradebook.result.overridden", "grade-result", id, { reason: input.reason.trim(), score: input.score, version: 1 });
      return { id, state: "draft" };
    });
  }

  async publishGrade(input: PublishGradeDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const updated = await client.query(
        `UPDATE learner_grade_results SET state='published',published_at=now(),version=version+1
         WHERE id=$1 AND version=$2 AND state='draft' RETURNING version`,
        [input.resultId, input.expectedVersion],
      );
      if (!updated.rowCount) throw new ConflictException("Draft grade result is stale or unavailable");
      await this.record(client, "gradebook.result.published", "grade-result", input.resultId, { version: updated.rows[0].version });
      return { id: input.resultId, state: "published", version: updated.rows[0].version };
    });
  }

  async createCertificateTemplate(institutionId: string, input: CreateCertificateTemplateDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO certificate_templates (id,tenant_id,institution_id,title,document_schema,created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, context.tenantId, institutionId, input.title.trim(), input.documentSchema, context.actorId],
      );
      return { id, version: 1 };
    });
  }

  async createAwardRule(institutionId: string, input: CreateAwardRuleDto) {
    if (Boolean(input.programmeId) === Boolean(input.courseDefinitionId)) throw new BadRequestException("Award rule requires exactly one programme or course definition");
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO certificate_award_rules (
          id,tenant_id,institution_id,template_id,programme_id,course_definition_id,rule_schema
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, context.tenantId, institutionId, input.templateId, input.programmeId ?? null, input.courseDefinitionId ?? null, input.ruleSchema],
      );
      return { id };
    });
  }

  async issueCertificate(institutionId: string, input: IssueCertificateDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const rule = await client.query(
        `SELECT r.id,t.title FROM certificate_award_rules r JOIN certificate_templates t ON t.id=r.template_id
         WHERE r.id=$1 AND r.institution_id=$2 AND r.status='active' AND t.status='approved'`,
        [input.awardRuleId, institutionId],
      );
      if (!rule.rowCount) throw new BadRequestException("Active award rule with approved template was not found");
      const person = await client.query(
        `SELECT concat_ws(' ',COALESCE(NULLIF(btrim(preferred_name),''),legal_given_names),legal_family_name) display_name
         FROM people WHERE id=$1 AND status='active'`,
        [input.learnerPersonId],
      );
      if (!person.rowCount) throw new BadRequestException("Active learner person was not found");
      if (input.enrolmentId) {
        const completed = await client.query("SELECT 1 FROM enrolments WHERE id=$1 AND learner_person_id=$2 AND status='completed'", [input.enrolmentId, input.learnerPersonId]);
        if (!completed.rowCount) throw new ConflictException("Certificate enrolment must be completed");
      }
      const payload = { learnerName: person.rows[0].display_name, credentialTitle: rule.rows[0].title, institutionId, enrolmentId: input.enrolmentId ?? null, issuedAt: new Date().toISOString() };
      const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      const verificationCode = randomUUID().replaceAll("-", "").slice(0,20).toUpperCase();
      const id = randomUUID();
      await client.query(
        `INSERT INTO issued_certificates (
          id,tenant_id,institution_id,learner_person_id,enrolment_id,award_rule_id,verification_code,payload,payload_checksum,issued_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, context.tenantId, institutionId, input.learnerPersonId, input.enrolmentId ?? null, input.awardRuleId, verificationCode, payload, checksum, context.actorId],
      );
      await this.record(client, "credential.certificate.issued", "issued-certificate", id, { verificationCode, payloadChecksum: checksum, version: 1 });
      return { id, verificationCode, payloadChecksum: checksum };
    });
  }

  async revokeCertificate(certificateId: string, input: RevokeCertificateDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const updated = await client.query(
        `UPDATE issued_certificates SET status='revoked',revoked_at=now(),revoked_by=$2,revocation_reason=$3
         WHERE id=$1 AND status='issued' RETURNING verification_code`,
        [certificateId, context.actorId, input.reason.trim()],
      );
      if (!updated.rowCount) throw new ConflictException("Issued certificate was not found or is already inactive");
      await this.record(client, "credential.certificate.revoked", "issued-certificate", certificateId, { reason: input.reason.trim(), version: 2 });
      return { id: certificateId, status: "revoked", verificationCode: updated.rows[0].verification_code };
    });
  }

  async verifyCertificate(verificationCode: string) {
    return this.database.queryWithoutTenant(
      `SELECT c.status,c.issued_at,c.revocation_reason,c.payload
       FROM issued_certificates c WHERE c.verification_code=$1`,
      [verificationCode.toUpperCase()],
    ).then((result) => {
      const row = result.rows[0];
      if (!row) return { valid: false };
      return { valid: row.status === "issued", status: row.status, issuedAt: row.issued_at, revocationReason: row.revocation_reason ?? undefined, payload: row.payload };
    });
  }

  async requestExport(institutionId: string | undefined, input: RequestExportDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO export_jobs (id,tenant_id,institution_id,export_type,format,filters,requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, context.tenantId, institutionId ?? null, input.exportType, input.format, input.filters, context.actorId],
      );
      await this.record(client, "export.requested", "export-job", id, { exportType: input.exportType, format: input.format, version: 1 });
      return { id, status: "requested" };
    });
  }

  async completeExport(exportId: string, input: CompleteExportDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const updated = await client.query(
        `UPDATE export_jobs SET status='ready',object_key=$2,checksum=$3,row_count=$4,ready_at=now(),expires_at=$5
         WHERE id=$1 AND status IN ('requested','processing') RETURNING id`,
        [exportId, input.objectKey, input.checksum, input.rowCount, input.expiresAt],
      );
      if (!updated.rowCount) throw new ConflictException("Export job is not completable");
      await this.record(client, "export.ready", "export-job", exportId, { checksum: input.checksum, rowCount: input.rowCount, expiresAt: input.expiresAt, version: 2 });
      return { id: exportId, status: "ready" };
    });
  }

  async metrics(institutionId?: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `SELECT d.metric_key,d.title,d.description,d.unit,s.metric_value,s.measured_at,
                s.source_max_occurred_at,s.drillthrough_filter,
                EXTRACT(EPOCH FROM (now()-s.source_max_occurred_at))::integer AS freshness_seconds
         FROM metric_snapshots s JOIN metric_definitions d ON d.id=s.metric_definition_id
         WHERE ($1::uuid IS NULL OR s.institution_id=$1)
         ORDER BY d.metric_key,s.measured_at DESC`,
        [institutionId ?? null],
      );
      return result.rows.map((row) => ({ key: row.metric_key, title: row.title, description: row.description, unit: row.unit, value: Number(row.metric_value), measuredAt: row.measured_at, sourceMaxOccurredAt: row.source_max_occurred_at, freshnessSeconds: Number(row.freshness_seconds), drillthroughFilter: row.drillthrough_filter }));
    });
  }

  async gradebook(courseRunId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [categories, items, formula, results] = await Promise.all([
        client.query("SELECT * FROM gradebook_categories WHERE course_run_id=$1 ORDER BY sequence_number", [courseRunId]),
        client.query("SELECT * FROM gradebook_items WHERE course_run_id=$1 ORDER BY title", [courseRunId]),
        client.query("SELECT * FROM gradebook_formula_versions WHERE course_run_id=$1 AND status='active'", [courseRunId]),
        client.query(`SELECT r.* FROM learner_grade_results r JOIN enrolments e ON e.id=r.enrolment_id WHERE e.course_run_id=$1 AND r.state<>'corrected'`, [courseRunId]),
      ]);
      return { courseRunId, categories: categories.rows, items: items.rows, formula: formula.rows[0], results: results.rows };
    });
  }

  private async previewFormula(client: PoolClient, courseRunId: string, formula: Record<string, unknown>) {
    const current = await client.query(
      `SELECT e.id AS enrolment_id,COALESCE(avg(COALESCE(r.override_score,r.calculated_score,r.raw_score)),0) AS current_score
       FROM enrolments e LEFT JOIN learner_grade_results r ON r.enrolment_id=e.id AND r.state<>'corrected'
       WHERE e.course_run_id=$1 GROUP BY e.id ORDER BY e.id LIMIT 500`, [courseRunId],
    );
    return { learnerCount: current.rowCount, formula, currentDistribution: current.rows.map((row) => ({ enrolmentId: row.enrolment_id, currentScore: Number(row.current_score) })) };
  }

  private async record(client: PoolClient, eventType: string, resourceType: string, resourceId: string, afterState: Record<string, unknown>) {
    const context = this.context.require();
    await this.audit.append(client, { tenantId: context.tenantId, plane: "application", eventType, actorId: context.actorId, membershipId: context.membershipId, resourceType, resourceId, correlationId: context.correlationId, afterState });
    await this.outbox.append(client, { tenantId: context.tenantId, aggregateType: resourceType, aggregateId: resourceId, aggregateVersion: Number(afterState.version ?? 1), eventName: eventType, eventVersion: 1, actorId: context.actorId, correlationId: context.correlationId, payload: afterState });
  }
}
