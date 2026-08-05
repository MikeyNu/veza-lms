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
  FinalizeSubmissionDto,
  RegisterSubmissionFileDto,
  StartSubmissionDto,
  UpdateUploadOffsetDto,
} from "./academic-evidence.dto.js";

interface AssignmentRow extends QueryResultRow {
  id: string;
  institution_id: string;
  learner_person_id: string;
  due_at: string | null;
  max_attempts: number;
  group_mode: "individual" | "group";
}

interface AttemptRow extends QueryResultRow {
  id: string;
  institution_id: string;
  assignment_id: string;
  enrolment_id: string;
  learner_person_id: string;
  attempt_number: number;
  status: string;
  due_at: string | null;
}

@Injectable()
export class LearnerSubmissionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async startSubmission(input: StartSubmissionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const owner = await client.query<{ learner_person_id: string } & QueryResultRow>(
        "SELECT app.require_owned_enrolment($1,$2) learner_person_id",
        [input.enrolmentId, context.actorId],
      );
      const learnerPersonId = owner.rows[0]?.learner_person_id;
      if (!learnerPersonId) throw new BadRequestException("Learner identity is not linked to the enrolment");

      const result = await client.query<AssignmentRow>(
        `SELECT a.id,a.institution_id,e.learner_person_id,a.due_at,a.max_attempts,a.group_mode
         FROM assignments a
         JOIN enrolments e ON e.id=$2 AND e.course_run_id=a.course_run_id
         WHERE a.id=$1 AND a.status='published'
           AND e.status='active' AND e.effective_until IS NULL
           AND e.learner_person_id=$3
         FOR UPDATE`,
        [input.assignmentId, input.enrolmentId, learnerPersonId],
      );
      const assignment = result.rows[0];
      if (!assignment) throw new BadRequestException("Published assignment and owned active enrolment were not found");

      let assignmentGroupId: string | null = null;
      if (assignment.group_mode === "group") {
        if (!input.assignmentGroupId) throw new BadRequestException("Group assignments require an assignment group");
        const membership = await client.query(
          `SELECT 1
           FROM assignment_groups g
           JOIN assignment_group_members m
             ON m.tenant_id=g.tenant_id AND m.assignment_group_id=g.id
           WHERE g.id=$1 AND g.assignment_id=$2 AND g.status='active'
             AND m.learner_person_id=$3 AND m.left_at IS NULL`,
          [input.assignmentGroupId, input.assignmentId, learnerPersonId],
        );
        if (!membership.rowCount) throw new BadRequestException("Learner is not a current member of the selected assignment group");
        assignmentGroupId = input.assignmentGroupId;
      } else if (input.assignmentGroupId) {
        throw new BadRequestException("Individual assignments cannot use an assignment group");
      }

      const accommodation = await client.query<{ extra_attempts: number } & QueryResultRow>(
        "SELECT extra_attempts FROM assignment_accommodations WHERE assignment_id=$1 AND learner_person_id=$2",
        [input.assignmentId, learnerPersonId],
      );
      const attempts = await client.query<{ count: string } & QueryResultRow>(
        "SELECT count(*)::text count FROM submission_attempts WHERE assignment_id=$1 AND enrolment_id=$2",
        [input.assignmentId, input.enrolmentId],
      );
      const nextAttempt = Number(attempts.rows[0]?.count ?? 0) + 1;
      if (nextAttempt > assignment.max_attempts + Number(accommodation.rows[0]?.extra_attempts ?? 0)) {
        throw new ConflictException("Attempt allowance has been exhausted");
      }

      if (input.supersedesAttemptId) {
        await client.query("SELECT app.require_owned_submission_attempt($1,$2)", [input.supersedesAttemptId, context.actorId]);
        const previous = await client.query(
          `SELECT 1 FROM submission_attempts
           WHERE id=$1 AND assignment_id=$2 AND enrolment_id=$3
             AND status IN ('submitted','accepted','withdrawn')`,
          [input.supersedesAttemptId, input.assignmentId, input.enrolmentId],
        );
        if (!previous.rowCount) throw new BadRequestException("Superseded attempt is not an eligible prior version");
      }

      const id = randomUUID();
      await client.query(
        `INSERT INTO submission_attempts (
          id,tenant_id,institution_id,assignment_id,enrolment_id,learner_person_id,
          attempt_number,supersedes_attempt_id,assignment_group_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          context.tenantId,
          assignment.institution_id,
          input.assignmentId,
          input.enrolmentId,
          learnerPersonId,
          nextAttempt,
          input.supersedesAttemptId ?? null,
          assignmentGroupId,
        ],
      );
      await this.record(client, "assessment.submission.started", id, {
        assignmentId: input.assignmentId,
        enrolmentId: input.enrolmentId,
        learnerPersonId,
        attemptNumber: nextAttempt,
        assignmentGroupId,
        version: nextAttempt,
      });
      return { id, attemptNumber: nextAttempt, status: "draft", assignmentGroupId };
    });
  }

  async registerFile(attemptId: string, input: RegisterSubmissionFileDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query("SELECT app.require_owned_submission_attempt($1,$2)", [attemptId, context.actorId]);
      const attempt = await client.query(
        "SELECT 1 FROM submission_attempts WHERE id=$1 AND status IN ('draft','uploading') FOR UPDATE",
        [attemptId],
      );
      if (!attempt.rowCount) throw new ConflictException("Submission attempt is not accepting files");
      if (input.uploadOffset > input.byteSize) throw new BadRequestException("Upload offset cannot exceed file size");

      const id = randomUUID();
      await client.query(
        `INSERT INTO submission_files (
          id,tenant_id,submission_attempt_id,file_name,object_key,media_type,byte_size,
          checksum,upload_session_id,upload_offset
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          context.tenantId,
          attemptId,
          input.fileName.trim(),
          input.objectKey,
          input.mediaType,
          input.byteSize,
          input.checksum,
          input.uploadSessionId,
          input.uploadOffset,
        ],
      );
      await client.query("UPDATE submission_attempts SET status='uploading' WHERE id=$1", [attemptId]);
      return { id, uploadOffset: input.uploadOffset, scanStatus: "pending" };
    });
  }

  async updateUploadOffset(fileId: string, input: UpdateUploadOffsetDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query("SELECT app.require_owned_submission_file($1,$2)", [fileId, context.actorId]);
      const updated = await client.query(
        `UPDATE submission_files SET upload_offset=$3
         WHERE id=$1 AND upload_session_id=$2
           AND upload_offset <= $3 AND $3 <= byte_size
         RETURNING id,upload_offset,byte_size`,
        [fileId, input.uploadSessionId, input.uploadOffset],
      );
      if (!updated.rowCount) throw new ConflictException("Upload session or offset is stale or exceeds the file size");
      return updated.rows[0];
    });
  }

  async finalizeSubmission(attemptId: string, input: FinalizeSubmissionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query("SELECT app.require_owned_submission_attempt($1,$2)", [attemptId, context.actorId]);
      const result = await client.query<AttemptRow>(
        `SELECT s.id,s.institution_id,s.assignment_id,s.enrolment_id,s.learner_person_id,
                s.attempt_number,s.status,a.due_at
         FROM submission_attempts s
         JOIN assignments a ON a.id=s.assignment_id
         WHERE s.id=$1 FOR UPDATE`,
        [attemptId],
      );
      const attempt = result.rows[0];
      if (!attempt) throw new NotFoundException("Submission attempt was not found");
      if (!["draft", "uploading"].includes(attempt.status)) throw new ConflictException("Submission attempt cannot be finalised");

      const incomplete = await client.query(
        `SELECT 1 FROM submission_files
         WHERE submission_attempt_id=$1
           AND (scan_status<>'clean' OR upload_offset<>byte_size)
         LIMIT 1`,
        [attemptId],
      );
      if (incomplete.rowCount) throw new ConflictException("All files must be fully uploaded and pass malware scanning");

      const submittedAt = new Date().toISOString();
      const receiptNumber = `VZ-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const receiptPayload = {
        attemptId,
        assignmentId: attempt.assignment_id,
        enrolmentId: attempt.enrolment_id,
        learnerPersonId: attempt.learner_person_id,
        attemptNumber: attempt.attempt_number,
        submittedAt,
        content: input.contentSnapshot,
      };
      const checksum = createHash("sha256").update(JSON.stringify(receiptPayload)).digest("hex");
      const isLate = Boolean(attempt.due_at && Date.parse(submittedAt) > Date.parse(attempt.due_at));
      await client.query(
        `UPDATE submission_attempts SET status='submitted',submitted_at=$2,receipt_number=$3,
          receipt_checksum=$4,content_snapshot=$5,is_late=$6 WHERE id=$1`,
        [attemptId, submittedAt, receiptNumber, checksum, input.contentSnapshot, isLate],
      );
      await this.record(client, "assessment.submission.finalised", attemptId, {
        receiptNumber,
        receiptChecksum: checksum,
        isLate,
        attemptNumber: attempt.attempt_number,
        version: attempt.attempt_number,
      });
      return { attemptId, receiptNumber, receiptChecksum: checksum, submittedAt, isLate };
    });
  }

  private async record(
    client: PoolClient,
    eventType: string,
    attemptId: string,
    afterState: Record<string, unknown>,
  ): Promise<void> {
    const context = this.context.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType: "submission-attempt",
      resourceId: attemptId,
      correlationId: context.correlationId,
      afterState,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: "submission-attempt",
      aggregateId: attemptId,
      aggregateVersion: Number(afterState.version ?? 1),
      eventName: eventType,
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: afterState,
    });
  }
}
