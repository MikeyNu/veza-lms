import { createHash, randomUUID } from "node:crypto";
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
import type {
  ApproveCertificateTemplateDto,
  ApproveRubricDto,
  AttachRubricDto,
  CreateAssignmentGroupDto,
  CreateRubricDto,
  EvaluateAwardRuleDto,
  IssueCertificateDto,
  ReleaseMarkDto,
  SubmitCertificateTemplateDto,
  SubmitRubricDto,
  UpdateAssignmentGroupMembersDto,
} from "./academic-evidence.dto.js";

interface VersionedRow extends QueryResultRow {
  id: string;
  institution_id: string;
  status: string;
  version: number;
  created_by: string;
  submitted_by: string | null;
}

interface AwardRuleRow extends QueryResultRow {
  id: string;
  institution_id: string;
  template_id: string;
  programme_id: string | null;
  course_definition_id: string | null;
  rule_schema: Record<string, unknown>;
  status: string;
}

@Injectable()
export class AcademicGovernanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createRubric(institutionId: string, input: CreateRubricDto) {
    const context = this.context.require();
    const rubricId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const totalScore = input.criteria.reduce((sum, criterion) => sum + criterion.maximumScore, 0);
      if (totalScore <= 0) throw new BadRequestException("Rubric criteria must have a positive total score");
      const sequences = new Set(input.criteria.map((criterion) => criterion.sequenceNumber));
      if (sequences.size !== input.criteria.length) throw new BadRequestException("Rubric criterion sequence numbers must be unique");

      await client.query(
        `INSERT INTO rubrics (
          id,tenant_id,institution_id,title,status,version,created_by,updated_by
        ) VALUES ($1,$2,$3,$4,'draft',1,$5,$5)`,
        [rubricId, context.tenantId, institutionId, input.title.trim(), context.actorId],
      );
      for (const criterion of input.criteria) {
        await client.query(
          `INSERT INTO rubric_criteria (
            tenant_id,rubric_id,criterion_id,sequence_number,title,description,maximum_score,levels
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.tenantId,
            rubricId,
            randomUUID(),
            criterion.sequenceNumber,
            criterion.title.trim(),
            criterion.description?.trim() ?? null,
            criterion.maximumScore,
            JSON.stringify(criterion.levels),
          ],
        );
      }
      await this.record(client, "assessment.rubric.created", "rubric", rubricId, {
        institutionId,
        criterionCount: input.criteria.length,
        maximumScore: totalScore,
        version: 1,
      });
      return { id: rubricId, status: "draft", version: 1, maximumScore: totalScore };
    });
  }

  async submitRubric(institutionId: string, rubricId: string, input: SubmitRubricDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const rubric = await this.lockVersioned(client, "rubrics", institutionId, rubricId);
      if (rubric.status !== "draft") throw new ConflictException("Only draft rubrics can be submitted for review");
      if (rubric.version !== input.expectedVersion) throw new ConflictException("Rubric changed since it was loaded");
      const criteria = await client.query("SELECT 1 FROM rubric_criteria WHERE rubric_id=$1 LIMIT 1", [rubricId]);
      if (!criteria.rowCount) throw new ConflictException("Rubric requires at least one criterion");
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE rubrics SET status='in_review',submitted_by=$3,submitted_at=now(),
          version=version+1,updated_by=$3,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [rubricId, input.expectedVersion, context.actorId],
      );
      await this.record(client, "assessment.rubric.submitted", "rubric", rubricId, {
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      });
      return { id: rubricId, status: "in_review", version: updated.rows[0].version };
    });
  }

  async approveRubric(institutionId: string, rubricId: string, input: ApproveRubricDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const rubric = await this.lockVersioned(client, "rubrics", institutionId, rubricId);
      if (rubric.status !== "in_review") throw new ConflictException("Rubric is not awaiting approval");
      if (rubric.version !== input.expectedVersion) throw new ConflictException("Rubric changed since it was loaded");
      if (rubric.created_by === context.actorId || rubric.submitted_by === context.actorId) {
        throw new ConflictException("Rubric approval requires an independent reviewer");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE rubrics SET status='approved',approved_by=$3,approved_at=now(),approval_notes=$4,
          version=version+1,updated_by=$3,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [rubricId, input.expectedVersion, context.actorId, input.notes.trim()],
      );
      await this.record(client, "assessment.rubric.approved", "rubric", rubricId, {
        notes: input.notes.trim(),
        version: updated.rows[0].version,
      });
      return { id: rubricId, status: "approved", version: updated.rows[0].version };
    });
  }

  async attachRubric(institutionId: string, assignmentId: string, input: AttachRubricDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const assignment = await client.query<{ version: number; status: string } & QueryResultRow>(
        "SELECT version,status FROM assignments WHERE id=$1 AND institution_id=$2 FOR UPDATE",
        [assignmentId, institutionId],
      );
      const current = assignment.rows[0];
      if (!current) throw new NotFoundException("Assignment was not found");
      if (current.status !== "draft") throw new ConflictException("Rubrics must be attached before assignment publication");
      if (current.version !== input.expectedAssignmentVersion) throw new ConflictException("Assignment changed since it was loaded");
      const rubric = await client.query(
        "SELECT 1 FROM rubrics WHERE id=$1 AND institution_id=$2 AND status='approved'",
        [input.rubricId, institutionId],
      );
      if (!rubric.rowCount) throw new BadRequestException("Assignment requires an approved rubric from the same institution");
      await client.query(
        `INSERT INTO assignment_rubrics(tenant_id,assignment_id,rubric_id)
         VALUES($1,$2,$3)
         ON CONFLICT (tenant_id,assignment_id) DO UPDATE SET rubric_id=EXCLUDED.rubric_id`,
        [context.tenantId, assignmentId, input.rubricId],
      );
      const updated = await client.query<{ version: number } & QueryResultRow>(
        "UPDATE assignments SET version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND version=$2 RETURNING version",
        [assignmentId, input.expectedAssignmentVersion, context.actorId],
      );
      await this.record(client, "assessment.assignment.rubric-attached", "assignment", assignmentId, {
        rubricId: input.rubricId,
        version: updated.rows[0].version,
      });
      return { id: assignmentId, rubricId: input.rubricId, version: updated.rows[0].version };
    });
  }

  async createAssignmentGroup(
    institutionId: string,
    assignmentId: string,
    input: CreateAssignmentGroupDto,
  ) {
    const context = this.context.require();
    const groupId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const assignment = await client.query<{ course_run_id: string; group_mode: string } & QueryResultRow>(
        `SELECT course_run_id,group_mode FROM assignments
         WHERE id=$1 AND institution_id=$2 AND status IN ('draft','published')`,
        [assignmentId, institutionId],
      );
      const current = assignment.rows[0];
      if (!current) throw new NotFoundException("Assignment was not found");
      if (current.group_mode !== "group") throw new ConflictException("Assignment is configured for individual submissions");
      const uniqueLearners = [...new Set(input.learnerPersonIds)];
      await this.requireCurrentRunLearners(client, current.course_run_id, uniqueLearners);
      await client.query(
        `INSERT INTO assignment_groups(id,tenant_id,assignment_id,name,created_by)
         VALUES($1,$2,$3,$4,$5)`,
        [groupId, context.tenantId, assignmentId, input.name.trim(), context.actorId],
      );
      for (const learnerPersonId of uniqueLearners) {
        await client.query(
          `INSERT INTO assignment_group_members(tenant_id,assignment_group_id,learner_person_id)
           VALUES($1,$2,$3)`,
          [context.tenantId, groupId, learnerPersonId],
        );
      }
      await this.record(client, "assessment.assignment-group.created", "assignment-group", groupId, {
        assignmentId,
        memberCount: uniqueLearners.length,
        version: 1,
      });
      return { id: groupId, memberCount: uniqueLearners.length };
    });
  }

  async updateAssignmentGroupMembers(
    institutionId: string,
    groupId: string,
    input: UpdateAssignmentGroupMembersDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const group = await client.query<{ course_run_id: string } & QueryResultRow>(
        `SELECT a.course_run_id FROM assignment_groups g
         JOIN assignments a ON a.id=g.assignment_id
         WHERE g.id=$1 AND a.institution_id=$2 AND g.status='active' FOR UPDATE`,
        [groupId, institutionId],
      );
      const current = group.rows[0];
      if (!current) throw new NotFoundException("Active assignment group was not found");
      const additions = [...new Set(input.addLearnerPersonIds ?? [])];
      const removals = [...new Set(input.removeLearnerPersonIds ?? [])];
      if (!additions.length && !removals.length) throw new BadRequestException("At least one membership change is required");
      if (additions.some((id) => removals.includes(id))) throw new BadRequestException("A learner cannot be added and removed in the same change");
      if (additions.length) await this.requireCurrentRunLearners(client, current.course_run_id, additions);
      for (const learnerPersonId of removals) {
        await client.query(
          `UPDATE assignment_group_members SET left_at=now()
           WHERE assignment_group_id=$1 AND learner_person_id=$2 AND left_at IS NULL`,
          [groupId, learnerPersonId],
        );
      }
      for (const learnerPersonId of additions) {
        await client.query(
          `INSERT INTO assignment_group_members(tenant_id,assignment_group_id,learner_person_id)
           VALUES($1,$2,$3)`,
          [context.tenantId, groupId, learnerPersonId],
        );
      }
      await this.record(client, "assessment.assignment-group.members-changed", "assignment-group", groupId, {
        additions,
        removals,
        reason: input.reason.trim(),
        version: 1,
      });
      return { id: groupId, added: additions.length, removed: removals.length };
    });
  }

  async submitCertificateTemplate(
    institutionId: string,
    templateId: string,
    input: SubmitCertificateTemplateDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const template = await this.lockVersioned(client, "certificate_templates", institutionId, templateId);
      if (template.status !== "draft") throw new ConflictException("Only draft certificate templates can be submitted");
      if (template.version !== input.expectedVersion) throw new ConflictException("Certificate template changed since it was loaded");
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE certificate_templates SET status='in_review',submitted_by=$3,submitted_at=now(),
          version=version+1,updated_by=$3,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [templateId, input.expectedVersion, context.actorId],
      );
      await this.record(client, "credentials.template.submitted", "certificate-template", templateId, {
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      });
      return { id: templateId, status: "in_review", version: updated.rows[0].version };
    });
  }

  async approveCertificateTemplate(
    institutionId: string,
    templateId: string,
    input: ApproveCertificateTemplateDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const template = await this.lockVersioned(client, "certificate_templates", institutionId, templateId);
      if (template.status !== "in_review") throw new ConflictException("Certificate template is not awaiting approval");
      if (template.version !== input.expectedVersion) throw new ConflictException("Certificate template changed since it was loaded");
      if (template.created_by === context.actorId || template.submitted_by === context.actorId) {
        throw new ConflictException("Certificate-template approval requires an independent reviewer");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE certificate_templates SET status='approved',approved_by=$3,approved_at=now(),
          approval_notes=$4,version=version+1,updated_by=$3,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [templateId, input.expectedVersion, context.actorId, input.notes.trim()],
      );
      await this.record(client, "credentials.template.approved", "certificate-template", templateId, {
        notes: input.notes.trim(),
        version: updated.rows[0].version,
      });
      return { id: templateId, status: "approved", version: updated.rows[0].version };
    });
  }

  async evaluateAwardRule(institutionId: string, awardRuleId: string, input: EvaluateAwardRuleDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const ruleResult = await client.query<AwardRuleRow>(
        `SELECT r.* FROM certificate_award_rules r
         JOIN certificate_templates t ON t.id=r.template_id AND t.status='approved'
         WHERE r.id=$1 AND r.institution_id=$2 AND r.status='active'`,
        [awardRuleId, institutionId],
      );
      const rule = ruleResult.rows[0];
      if (!rule) throw new NotFoundException("Active award rule with an approved template was not found");
      const learner = await client.query(
        `SELECT 1 FROM learner_profiles lp JOIN people p ON p.id=lp.person_id
         WHERE lp.person_id=$1 AND lp.institution_id=$2 AND p.status='active'`,
        [input.learnerPersonId, institutionId],
      );
      if (!learner.rowCount) throw new BadRequestException("Learner is not active in this institution");

      const findings: Array<{ code: string; passed: boolean; detail: string }> = [];
      const evidence: Record<string, unknown> = {
        awardRuleId,
        learnerPersonId: input.learnerPersonId,
        enrolmentId: input.enrolmentId ?? null,
      };
      const requireCompletion = rule.rule_schema.requireCompletion !== false;
      const minimumResult = typeof rule.rule_schema.minimumResult === "number"
        ? rule.rule_schema.minimumResult
        : undefined;
      const requirePublishedResults = rule.rule_schema.requirePublishedResults === true;

      if (rule.course_definition_id) {
        const completion = await client.query<{
          enrolment_id: string;
          status: string;
          completion_result: number | null;
          course_definition_id: string;
        } & QueryResultRow>(
          `SELECT e.id enrolment_id,e.status,e.completion_result,b.course_definition_id
           FROM enrolments e
           JOIN course_runs run ON run.id=e.course_run_id
           JOIN course_blueprint_versions b ON b.id=run.course_blueprint_version_id
           WHERE e.learner_person_id=$1 AND e.institution_id=$2
             AND b.course_definition_id=$3
             AND ($4::uuid IS NULL OR e.id=$4)
           ORDER BY e.created_at DESC LIMIT 1`,
          [input.learnerPersonId, institutionId, rule.course_definition_id, input.enrolmentId ?? null],
        );
        const row = completion.rows[0];
        evidence.courseEnrolment = row ?? null;
        findings.push({
          code: "course-enrolment",
          passed: Boolean(row),
          detail: row ? "Matching course enrolment found" : "No matching course enrolment found",
        });
        if (requireCompletion) {
          findings.push({
            code: "course-completion",
            passed: row?.status === "completed",
            detail: row?.status === "completed" ? "Course enrolment is completed" : "Course enrolment is not completed",
          });
        }
        if (minimumResult !== undefined) {
          findings.push({
            code: "minimum-result",
            passed: row?.completion_result !== null && row?.completion_result !== undefined && Number(row.completion_result) >= minimumResult,
            detail: `Completion result must be at least ${minimumResult}`,
          });
        }
      }

      if (rule.programme_id) {
        const coverage = await client.query<{
          required_count: number;
          completed_count: number;
        } & QueryResultRow>(
          `WITH required AS (
             SELECT DISTINCT b.course_definition_id
             FROM programme_versions pv
             JOIN programme_version_courses pvc ON pvc.programme_version_id=pv.id
             JOIN course_blueprint_versions b ON b.id=pvc.course_blueprint_version_id
             WHERE pv.programme_id=$3 AND pv.lifecycle='approved'
               AND pv.effective_from<=current_date
               AND (pv.effective_until IS NULL OR pv.effective_until>current_date)
               AND pvc.requirement_type='required'
           ), completed AS (
             SELECT DISTINCT b.course_definition_id
             FROM enrolments e
             JOIN course_runs run ON run.id=e.course_run_id
             JOIN course_blueprint_versions b ON b.id=run.course_blueprint_version_id
             WHERE e.learner_person_id=$1 AND e.institution_id=$2 AND e.status='completed'
           )
           SELECT count(*)::int required_count,
                  count(*) FILTER (WHERE c.course_definition_id IS NOT NULL)::int completed_count
           FROM required r LEFT JOIN completed c USING(course_definition_id)`,
          [input.learnerPersonId, institutionId, rule.programme_id],
        );
        const row = coverage.rows[0] ?? { required_count: 0, completed_count: 0 };
        evidence.programmeCoverage = row;
        findings.push({
          code: "programme-required-courses",
          passed: row.required_count > 0 && row.completed_count === row.required_count,
          detail: `${row.completed_count} of ${row.required_count} required courses completed`,
        });
      }

      if (requirePublishedResults) {
        const published = await client.query<{ result_count: number } & QueryResultRow>(
          `SELECT count(*)::int result_count FROM learner_grade_results r
           JOIN enrolments e ON e.id=r.enrolment_id
           WHERE e.learner_person_id=$1 AND e.institution_id=$2 AND r.state='published'`,
          [input.learnerPersonId, institutionId],
        );
        const count = published.rows[0]?.result_count ?? 0;
        evidence.publishedResultCount = count;
        findings.push({
          code: "published-results",
          passed: count > 0,
          detail: count > 0 ? `${count} published results found` : "No published results found",
        });
      }

      const eligible = findings.length > 0 && findings.every((finding) => finding.passed);
      const checksum = createHash("sha256").update(JSON.stringify({ evidence, findings, eligible })).digest("hex");
      let evaluationId: string | undefined;
      if (input.persistEvaluation) {
        evaluationId = randomUUID();
        await client.query(
          `INSERT INTO award_rule_evaluations (
            id,tenant_id,institution_id,award_rule_id,learner_person_id,enrolment_id,
            eligible,findings,evidence_snapshot,evidence_checksum,evaluated_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            evaluationId,
            context.tenantId,
            institutionId,
            awardRuleId,
            input.learnerPersonId,
            input.enrolmentId ?? null,
            eligible,
            JSON.stringify(findings),
            JSON.stringify(evidence),
            checksum,
            context.actorId,
          ],
        );
        await this.record(client, "credentials.award-rule.evaluated", "award-rule-evaluation", evaluationId, {
          awardRuleId,
          learnerPersonId: input.learnerPersonId,
          eligible,
          evidenceChecksum: checksum,
          version: 1,
        });
      }
      return { id: evaluationId, eligible, findings, evidence, evidenceChecksum: checksum };
    });
  }

  async issueCertificate(institutionId: string, input: IssueCertificateDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      if (!input.awardEvaluationId) throw new BadRequestException("Certificate issuance requires a persisted award evaluation");
      const evaluation = await client.query<{
        eligible: boolean;
        award_rule_id: string;
        learner_person_id: string;
        enrolment_id: string | null;
        evidence_checksum: string;
      } & QueryResultRow>(
        `SELECT eligible,award_rule_id,learner_person_id,enrolment_id,evidence_checksum
         FROM award_rule_evaluations
         WHERE id=$1 AND institution_id=$2`,
        [input.awardEvaluationId, institutionId],
      );
      const evidence = evaluation.rows[0];
      if (!evidence || !evidence.eligible) throw new ConflictException("Award evaluation is missing or not eligible");
      if (evidence.award_rule_id !== input.awardRuleId || evidence.learner_person_id !== input.learnerPersonId) {
        throw new BadRequestException("Award evaluation does not match the certificate request");
      }
      if ((evidence.enrolment_id ?? null) !== (input.enrolmentId ?? null)) {
        throw new BadRequestException("Award evaluation enrolment does not match the certificate request");
      }
      const rule = await client.query<{
        title: string;
        template_id: string;
      } & QueryResultRow>(
        `SELECT t.title,r.template_id
         FROM certificate_award_rules r
         JOIN certificate_templates t ON t.id=r.template_id AND t.status='approved'
         WHERE r.id=$1 AND r.institution_id=$2 AND r.status='active'`,
        [input.awardRuleId, institutionId],
      );
      const current = rule.rows[0];
      if (!current) throw new ConflictException("Award rule or approved certificate template is unavailable");
      const duplicate = await client.query(
        `SELECT 1 FROM issued_certificates
         WHERE award_rule_id=$1 AND learner_person_id=$2
           AND status='issued' AND ($3::uuid IS NULL OR enrolment_id=$3)
         LIMIT 1`,
        [input.awardRuleId, input.learnerPersonId, input.enrolmentId ?? null],
      );
      if (duplicate.rowCount) throw new ConflictException("An active certificate already exists for this award evidence");

      const id = randomUUID();
      const verificationCode = randomUUID().replaceAll("-", "").toUpperCase();
      const payload = {
        certificateId: id,
        institutionId,
        learnerPersonId: input.learnerPersonId,
        enrolmentId: input.enrolmentId ?? null,
        awardRuleId: input.awardRuleId,
        awardEvaluationId: input.awardEvaluationId,
        awardEvidenceChecksum: evidence.evidence_checksum,
        credentialTitle: current.title,
        issuedAt: new Date().toISOString(),
      };
      const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      await client.query(
        `INSERT INTO issued_certificates (
          id,tenant_id,institution_id,learner_person_id,enrolment_id,award_rule_id,
          award_evaluation_id,verification_code,payload,payload_checksum,issued_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.learnerPersonId,
          input.enrolmentId ?? null,
          input.awardRuleId,
          input.awardEvaluationId,
          verificationCode,
          JSON.stringify(payload),
          checksum,
          context.actorId,
        ],
      );
      await this.record(client, "credentials.certificate.issued", "issued-certificate", id, {
        learnerPersonId: input.learnerPersonId,
        awardRuleId: input.awardRuleId,
        awardEvaluationId: input.awardEvaluationId,
        verificationCode,
        payloadChecksum: checksum,
        version: 1,
      });
      return { id, verificationCode, payloadChecksum: checksum, status: "issued" };
    });
  }

  async releaseMark(markId: string, input: ReleaseMarkDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const mark = await client.query<{
        id: string;
        status: string;
        version: number;
        score: number;
        submission_attempt_id: string;
        enrolment_id: string;
        assignment_id: string;
      } & QueryResultRow>(
        `SELECT m.id,m.status,m.version,m.score,m.submission_attempt_id,
                s.enrolment_id,s.assignment_id
         FROM submission_marks m JOIN submission_attempts s ON s.id=m.submission_attempt_id
         WHERE m.id=$1 FOR UPDATE`,
        [markId],
      );
      const current = mark.rows[0];
      if (!current) throw new NotFoundException("Submission mark was not found");
      if (!['submitted','moderated'].includes(current.status)) throw new ConflictException("Only submitted or moderated marks can be released");
      if (current.version !== input.expectedVersion) throw new ConflictException("Submission mark changed since it was loaded");
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE submission_marks SET status='released',released_at=now(),released_by=$3,
          release_reason=$4,version=version+1
         WHERE id=$1 AND version=$2 RETURNING version`,
        [markId, input.expectedVersion, context.actorId, input.reason.trim()],
      );
      const item = await client.query<{ id: string } & QueryResultRow>(
        "SELECT id FROM gradebook_items WHERE assignment_id=$1 AND status<>'retired' ORDER BY id LIMIT 1",
        [current.assignment_id],
      );
      let resultId: string | undefined;
      if (item.rows[0]) {
        const existing = await client.query<{ id: string; version: number; state: string } & QueryResultRow>(
          `SELECT id,version,state FROM learner_grade_results
           WHERE enrolment_id=$1 AND gradebook_item_id=$2 AND state<>'corrected'
           FOR UPDATE`,
          [current.enrolment_id, item.rows[0].id],
        );
        if (existing.rows[0]?.state === "published") {
          await client.query("UPDATE learner_grade_results SET state='corrected' WHERE id=$1", [existing.rows[0].id]);
        }
        resultId = randomUUID();
        await client.query(
          `INSERT INTO learner_grade_results (
            id,tenant_id,enrolment_id,gradebook_item_id,source_mark_id,raw_score,
            calculated_score,state,version,supersedes_result_id,created_by,published_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$6,'published',1,$7,$8,now())`,
          [
            resultId,
            context.tenantId,
            current.enrolment_id,
            item.rows[0].id,
            markId,
            current.score,
            existing.rows[0]?.id ?? null,
            context.actorId,
          ],
        );
      }
      await this.record(client, "assessment.result.released", "submission-mark", markId, {
        reason: input.reason.trim(),
        gradeResultId: resultId,
        version: updated.rows[0].version,
      });
      return { id: markId, status: "released", version: updated.rows[0].version, gradeResultId: resultId };
    });
  }

  private async lockVersioned(
    client: PoolClient,
    table: "rubrics" | "certificate_templates",
    institutionId: string,
    id: string,
  ): Promise<VersionedRow> {
    const result = await client.query<VersionedRow>(
      `SELECT id,institution_id,status,version,created_by,submitted_by
       FROM ${table} WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
      [id, institutionId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Governed record was not found");
    return row;
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const institution = await client.query("SELECT 1 FROM institutions WHERE id=$1 AND status='active'", [institutionId]);
    if (!institution.rowCount) throw new BadRequestException("Active institution was not found");
  }

  private async requireCurrentRunLearners(
    client: PoolClient,
    courseRunId: string,
    learnerPersonIds: readonly string[],
  ): Promise<void> {
    const eligible = await client.query<{ learner_person_id: string } & QueryResultRow>(
      `SELECT learner_person_id FROM enrolments
       WHERE course_run_id=$1 AND learner_person_id=ANY($2::uuid[])
         AND status IN ('active','pending') AND effective_until IS NULL`,
      [courseRunId, learnerPersonIds],
    );
    const found = new Set(eligible.rows.map((row) => row.learner_person_id));
    const missing = learnerPersonIds.filter((id) => !found.has(id));
    if (missing.length) throw new BadRequestException(`Assignment-group learners are not currently enrolled: ${missing.join(", ")}`);
  }

  private async record(
    client: PoolClient,
    eventType: string,
    resourceType: string,
    resourceId: string,
    afterState: Record<string, unknown>,
  ): Promise<void> {
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
