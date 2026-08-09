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
  AnalyseCourseImportDto,
  CreateCourseSpaceDto,
  CreateReusableBlockDto,
  CreateStudioCommentDto,
  CreateStudioLessonDto,
  CreateStudioModuleDto,
  DecideStudioReviewDto,
  PublishCourseSpaceDto,
  RequestStudioReviewDto,
  ResolveStudioCommentDto,
  SaveStudioRevisionDto,
  StartEditableLessonVersionDto,
  StudioBlockDto,
} from "./studio.dto.js";

interface LessonRow extends QueryResultRow {
  id: string;
  institution_id: string;
  course_space_id: string;
  current_revision_id: string | null;
  status: string;
  version: number;
}

interface ValidationFinding {
  code: string;
  severity: "error" | "warning";
  blockId?: string;
  message: string;
}

@Injectable()
export class StudioService {
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
      const [spaces, modules, lessons] = await Promise.all([
        client.query(
          `SELECT space.id,space.institution_id "institutionId",
                  space.course_blueprint_version_id "blueprintVersionId",space.title,
                  space.status,space.version,
                  count(DISTINCT module.id)::int "moduleCount",
                  count(DISTINCT lesson.id)::int "lessonCount",
                  snapshot.id "currentPublicationId"
           FROM studio_course_spaces space
           LEFT JOIN studio_modules module
             ON module.tenant_id=space.tenant_id AND module.course_space_id=space.id
           LEFT JOIN studio_lessons lesson
             ON lesson.tenant_id=space.tenant_id AND lesson.course_space_id=space.id
           LEFT JOIN studio_publication_snapshots snapshot
             ON snapshot.tenant_id=space.tenant_id AND snapshot.course_space_id=space.id
            AND snapshot.status='current'
           WHERE space.institution_id=$1
           GROUP BY space.id,snapshot.id
           ORDER BY space.updated_at DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT id,course_space_id "courseSpaceId",title,description,
                  sequence_number "sequenceNumber",availability_rule "availabilityRule",
                  completion_rule "completionRule",status,version
           FROM studio_modules WHERE institution_id=$1
           ORDER BY course_space_id,sequence_number,id`,
          [institutionId],
        ),
        client.query(
          `SELECT id,course_space_id "courseSpaceId",module_id "moduleId",title,summary,
                  sequence_number "sequenceNumber",lesson_type "lessonType",
                  estimated_minutes "estimatedMinutes",availability_rule "availabilityRule",
                  completion_rule "completionRule",status,
                  current_revision_id "currentRevisionId",version
           FROM studio_lessons WHERE institution_id=$1
           ORDER BY course_space_id,module_id,sequence_number,id`,
          [institutionId],
        ),
      ]);
      return { institutionId, spaces: spaces.rows, modules: modules.rows, lessons: lessons.rows };
    });
  }

  async lesson(institutionId: string, lessonId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const lesson = await client.query(
        `SELECT lesson.id,lesson.course_space_id "courseSpaceId",lesson.module_id "moduleId",
                lesson.title,lesson.summary,lesson.sequence_number "sequenceNumber",
                lesson.lesson_type "lessonType",lesson.estimated_minutes "estimatedMinutes",
                lesson.availability_rule "availabilityRule",lesson.completion_rule "completionRule",
                lesson.status,lesson.current_revision_id "currentRevisionId",lesson.version
         FROM studio_lessons lesson
         WHERE lesson.id=$1 AND lesson.institution_id=$2`,
        [lessonId, institutionId],
      );
      if (!lesson.rows[0]) throw new NotFoundException("Studio lesson was not found");
      const [revisions, comments, reviews] = await Promise.all([
        client.query(
          `SELECT id,lesson_id "lessonId",revision_number "revisionNumber",
                  based_on_revision_id "basedOnRevisionId",block_document blocks,
                  checksum_sha256 "checksumSha256",change_summary "changeSummary",
                  accessibility_report "accessibilityReport",link_report "linkReport",
                  reading_metrics "readingMetrics",created_by "createdBy",created_at "createdAt"
           FROM studio_lesson_revisions
           WHERE lesson_id=$1 ORDER BY revision_number DESC`,
          [lessonId],
        ),
        client.query(
          `SELECT id,revision_id "revisionId",block_id "blockId",
                  parent_comment_id "parentCommentId",body,status,version,
                  created_by "createdBy",resolved_by "resolvedBy",
                  resolved_at "resolvedAt",created_at "createdAt",updated_at "updatedAt"
           FROM studio_comments
           WHERE lesson_id=$1 AND status <> 'deleted'
           ORDER BY created_at,id`,
          [lessonId],
        ),
        client.query(
          `SELECT id,revision_id "revisionId",status,requested_by "requestedBy",
                  requested_at "requestedAt",reviewed_by "reviewedBy",
                  reviewed_at "reviewedAt",decision_notes "decisionNotes",version
           FROM studio_review_requests
           WHERE lesson_id=$1 ORDER BY requested_at DESC`,
          [lessonId],
        ),
      ]);
      return { ...lesson.rows[0], revisions: revisions.rows, comments: comments.rows, reviews: reviews.rows };
    });
  }

  async createCourseSpace(institutionId: string, input: CreateCourseSpaceDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const blueprint = await client.query(
        `SELECT id FROM course_blueprint_versions
         WHERE id=$1 AND institution_id=$2 AND lifecycle='approved'
           AND effective_from <= current_date
           AND (effective_until IS NULL OR effective_until > current_date)`,
        [input.blueprintVersionId, institutionId],
      );
      if (!blueprint.rowCount) {
        throw new BadRequestException("Studio requires an effective approved blueprint version");
      }
      await client.query(
        `INSERT INTO studio_course_spaces (
           id,tenant_id,institution_id,course_blueprint_version_id,title,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [id, context.tenantId, institutionId, input.blueprintVersionId, input.title.trim(), context.actorId],
      );
      await this.record(client, "studio.course-space.created", "studio-course-space", id, {
        institutionId,
        blueprintVersionId: input.blueprintVersionId,
        version: 1,
      });
      return { id, status: "draft", version: 1 };
    });
  }

  async createModule(institutionId: string, input: CreateStudioModuleDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireEditableSpace(client, institutionId, input.courseSpaceId);
      await client.query(
        `INSERT INTO studio_modules (
           id,tenant_id,institution_id,course_space_id,title,description,sequence_number,
           availability_rule,completion_rule,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.courseSpaceId,
          input.title.trim(),
          input.description?.trim() || null,
          input.sequenceNumber,
          input.availabilityRule ?? {},
          input.completionRule ?? {},
          context.actorId,
        ],
      );
      await this.bumpSpace(client, input.courseSpaceId);
      await this.record(client, "studio.module.created", "studio-module", id, {
        courseSpaceId: input.courseSpaceId,
        sequenceNumber: input.sequenceNumber,
        version: 1,
      });
      return { id, status: "draft", version: 1 };
    });
  }

  async createLesson(institutionId: string, input: CreateStudioLessonDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireEditableSpace(client, institutionId, input.courseSpaceId);
      const module = await client.query(
        `SELECT id FROM studio_modules
         WHERE id=$1 AND course_space_id=$2 AND institution_id=$3 AND status <> 'retired'`,
        [input.moduleId, input.courseSpaceId, institutionId],
      );
      if (!module.rowCount) throw new BadRequestException("Studio module does not belong to this course space");
      await client.query(
        `INSERT INTO studio_lessons (
           id,tenant_id,institution_id,course_space_id,module_id,title,summary,
           sequence_number,lesson_type,estimated_minutes,availability_rule,
           completion_rule,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.courseSpaceId,
          input.moduleId,
          input.title.trim(),
          input.summary?.trim() || null,
          input.sequenceNumber,
          input.lessonType,
          input.estimatedMinutes ?? null,
          input.availabilityRule ?? {},
          input.completionRule ?? {},
          context.actorId,
        ],
      );
      await this.bumpSpace(client, input.courseSpaceId);
      await this.record(client, "studio.lesson.created", "studio-lesson", id, {
        courseSpaceId: input.courseSpaceId,
        moduleId: input.moduleId,
        lessonType: input.lessonType,
        version: 1,
      });
      return { id, status: "draft", version: 1 };
    });
  }

  async startEditableVersion(
    institutionId: string,
    lessonId: string,
    input: StartEditableLessonVersionDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<LessonRow>(
        `SELECT id,institution_id,course_space_id,current_revision_id,status,version
         FROM studio_lessons WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [lessonId, institutionId],
      );
      const lesson = result.rows[0];
      if (!lesson) throw new NotFoundException("Studio lesson was not found");
      if (lesson.version !== input.expectedLessonVersion) {
        throw new ConflictException("Lesson changed since it was loaded");
      }
      if (lesson.status === "retired") {
        throw new ConflictException("Retired lessons cannot be edited");
      }
      if (lesson.status !== "published") {
        throw new ConflictException("Only published lessons require a new editable version");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_lessons
         SET status='draft',version=version+1,updated_by=$3,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [lessonId, input.expectedLessonVersion, context.actorId],
      );
      await this.bumpSpace(client, lesson.course_space_id);
      await this.record(client, "studio.lesson.editable-version-started", "studio-lesson", lessonId, {
        basedOnRevisionId: lesson.current_revision_id,
        previousStatus: lesson.status,
        version: updated.rows[0].version,
      });
      return {
        id: lessonId,
        status: "draft",
        version: updated.rows[0].version,
        basedOnRevisionId: lesson.current_revision_id,
      };
    });
  }

  async saveRevision(institutionId: string, lessonId: string, input: SaveStudioRevisionDto) {
    const context = this.context.require();
    const encoded = JSON.stringify(input.blocks);
    if (Buffer.byteLength(encoded, "utf8") > 4194304) {
      throw new BadRequestException("Structured lesson document exceeds the supported size");
    }
    const validation = this.validateBlocks(input.blocks);
    const checksum = createHash("sha256").update(encoded).digest("hex");
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const lessonResult = await client.query<LessonRow>(
        `SELECT id,institution_id,course_space_id,current_revision_id,status,version
         FROM studio_lessons WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [lessonId, institutionId],
      );
      const lesson = lessonResult.rows[0];
      if (!lesson) throw new NotFoundException("Studio lesson was not found");
      if (lesson.version !== input.expectedLessonVersion) {
        throw new ConflictException("Lesson changed since it was loaded");
      }
      if (["published", "retired"].includes(lesson.status)) {
        throw new ConflictException("Create a new editable lesson version before changing published content");
      }
      if (input.basedOnRevisionId && input.basedOnRevisionId !== lesson.current_revision_id) {
        throw new ConflictException("Autosave base revision is stale");
      }
      if (lesson.current_revision_id) {
        const current = await client.query<{
          id: string;
          revision_number: number;
          checksum_sha256: string;
        } & QueryResultRow>(
          `SELECT id,revision_number,checksum_sha256
           FROM studio_lesson_revisions WHERE id=$1 AND lesson_id=$2`,
          [lesson.current_revision_id, lessonId],
        );
        if (current.rows[0]?.checksum_sha256 === checksum) {
          return {
            id: current.rows[0].id,
            revisionNumber: current.rows[0].revision_number,
            checksum,
            lessonVersion: lesson.version,
            unchanged: true,
          };
        }
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`studio-lesson:${lessonId}`],
      );
      const next = await client.query<{ revision_number: number } & QueryResultRow>(
        `SELECT COALESCE(max(revision_number),0)+1 revision_number
         FROM studio_lesson_revisions WHERE lesson_id=$1`,
        [lessonId],
      );
      const revisionId = randomUUID();
      await client.query(
        `INSERT INTO studio_lesson_revisions (
           id,tenant_id,institution_id,lesson_id,revision_number,based_on_revision_id,
           block_document,checksum_sha256,change_summary,accessibility_report,
           link_report,reading_metrics,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          revisionId,
          context.tenantId,
          institutionId,
          lessonId,
          Number(next.rows[0]?.revision_number ?? 1),
          input.basedOnRevisionId ?? null,
          encoded,
          checksum,
          input.changeSummary.trim(),
          validation.accessibility,
          validation.links,
          validation.reading,
          context.actorId,
        ],
      );
      if (input.outcomeIds?.length) {
        const outcomes = [...new Set(input.outcomeIds)];
        const valid = await client.query(
          `SELECT id FROM learning_outcomes
           WHERE institution_id=$1 AND status='active' AND id=ANY($2::uuid[])`,
          [institutionId, outcomes],
        );
        if (valid.rowCount !== outcomes.length) {
          throw new BadRequestException("Every lesson outcome must be active in this institution");
        }
        await client.query("DELETE FROM studio_lesson_outcomes WHERE lesson_id=$1", [lessonId]);
        for (const outcomeId of outcomes) {
          await client.query(
            `INSERT INTO studio_lesson_outcomes (
               tenant_id,lesson_id,learning_outcome_id,evidence_level
             ) VALUES ($1,$2,$3,'developed')`,
            [context.tenantId, lessonId, outcomeId],
          );
        }
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_lessons
         SET current_revision_id=$3,status='draft',version=version+1,
             updated_by=$4,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [lessonId, input.expectedLessonVersion, revisionId, context.actorId],
      );
      await client.query(
        `UPDATE studio_review_requests
         SET status='cancelled',reviewed_by=$2,reviewed_at=now(),
             decision_notes='Superseded by a new lesson revision',version=version+1
         WHERE lesson_id=$1 AND status='pending'`,
        [lessonId, context.actorId],
      );
      await this.bumpSpace(client, lesson.course_space_id);
      await this.record(client, "studio.lesson.revision-saved", "studio-lesson", lessonId, {
        revisionId,
        revisionNumber: Number(next.rows[0]?.revision_number ?? 1),
        checksum,
        accessibilityPassed: validation.accessibility.passed,
        linksPassed: validation.links.passed,
        wordCount: validation.reading.wordCount,
        version: updated.rows[0].version,
      });
      return {
        id: revisionId,
        lessonId,
        revisionNumber: Number(next.rows[0]?.revision_number ?? 1),
        checksumSha256: checksum,
        accessibilityReport: validation.accessibility,
        linkReport: validation.links,
        readingMetrics: validation.reading,
        lessonVersion: updated.rows[0].version,
      };
    });
  }

  async createReusableBlock(institutionId: string, input: CreateReusableBlockDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        `INSERT INTO studio_reusable_blocks (
           id,tenant_id,institution_id,name,block_type,content,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [id, context.tenantId, institutionId, input.name.trim(), input.blockType, input.content, context.actorId],
      );
      await this.record(client, "studio.reusable-block.created", "studio-reusable-block", id, {
        institutionId,
        blockType: input.blockType,
        version: 1,
      });
      return { id, status: "active", version: 1 };
    });
  }

  async createComment(institutionId: string, lessonId: string, input: CreateStudioCommentDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const revision = await client.query(
        `SELECT revision.id FROM studio_lesson_revisions revision
         JOIN studio_lessons lesson ON lesson.tenant_id=revision.tenant_id AND lesson.id=revision.lesson_id
         WHERE revision.id=$1 AND lesson.id=$2 AND lesson.institution_id=$3`,
        [input.revisionId, lessonId, institutionId],
      );
      if (!revision.rowCount) throw new NotFoundException("Lesson revision was not found");
      if (input.parentCommentId) {
        const parent = await client.query(
          `SELECT id FROM studio_comments WHERE id=$1 AND lesson_id=$2 AND status <> 'deleted'`,
          [input.parentCommentId, lessonId],
        );
        if (!parent.rowCount) throw new BadRequestException("Parent comment was not found");
      }
      await client.query(
        `INSERT INTO studio_comments (
           id,tenant_id,institution_id,lesson_id,revision_id,block_id,parent_comment_id,
           body,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          context.tenantId,
          institutionId,
          lessonId,
          input.revisionId,
          input.blockId ?? null,
          input.parentCommentId ?? null,
          input.body.trim(),
          context.actorId,
        ],
      );
      await this.record(client, "studio.comment.created", "studio-comment", id, {
        lessonId,
        revisionId: input.revisionId,
        blockId: input.blockId,
        version: 1,
      });
      return { id, status: "open", version: 1 };
    });
  }

  async resolveComment(institutionId: string, commentId: string, input: ResolveStudioCommentDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ status: string; version: number } & QueryResultRow>(
        `SELECT comment.status,comment.version FROM studio_comments comment
         WHERE comment.id=$1 AND comment.institution_id=$2 FOR UPDATE`,
        [commentId, institutionId],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Studio comment was not found");
      if (current.version !== input.expectedVersion) throw new ConflictException("Comment changed since it was loaded");
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_comments
         SET status=$3,resolved_by=CASE WHEN $3='resolved' THEN $4 ELSE NULL END,
             resolved_at=CASE WHEN $3='resolved' THEN now() ELSE NULL END,
             version=version+1,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [commentId, input.expectedVersion, input.status, context.actorId],
      );
      await this.record(client, "studio.comment.status-changed", "studio-comment", commentId, {
        from: current.status,
        to: input.status,
        version: updated.rows[0].version,
      });
      return { id: commentId, status: input.status, version: updated.rows[0].version };
    });
  }

  async requestReview(institutionId: string, lessonId: string, input: RequestStudioReviewDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const lesson = await client.query<LessonRow>(
        `SELECT id,institution_id,course_space_id,current_revision_id,status,version
         FROM studio_lessons WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [lessonId, institutionId],
      );
      const current = lesson.rows[0];
      if (!current) throw new NotFoundException("Studio lesson was not found");
      if (current.current_revision_id !== input.revisionId) {
        throw new ConflictException("Only the current lesson revision can enter review");
      }
      const revision = await client.query<{
        accessibility_report: { passed?: boolean };
        link_report: { passed?: boolean };
      } & QueryResultRow>(
        `SELECT accessibility_report,link_report FROM studio_lesson_revisions WHERE id=$1`,
        [input.revisionId],
      );
      if (!revision.rows[0]?.accessibility_report?.passed || !revision.rows[0]?.link_report?.passed) {
        throw new ConflictException("Resolve accessibility and link validation findings before review");
      }
      const openComments = await client.query(
        `SELECT 1 FROM studio_comments
         WHERE lesson_id=$1 AND revision_id=$2 AND status IN ('open','reopened') LIMIT 1`,
        [lessonId, input.revisionId],
      );
      if (openComments.rowCount) throw new ConflictException("Resolve open review comments before submission");
      await client.query(
        `INSERT INTO studio_review_requests (
           id,tenant_id,institution_id,lesson_id,revision_id,requested_by
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, context.tenantId, institutionId, lessonId, input.revisionId, context.actorId],
      );
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_lessons SET status='in_review',version=version+1,
             updated_by=$2,updated_at=now() WHERE id=$1 RETURNING version`,
        [lessonId, context.actorId],
      );
      await this.record(client, "studio.lesson.review-requested", "studio-review", id, {
        lessonId,
        revisionId: input.revisionId,
        version: 1,
        lessonVersion: updated.rows[0].version,
      });
      return { id, status: "pending", version: 1, lessonVersion: updated.rows[0].version };
    });
  }

  async decideReview(institutionId: string, reviewId: string, input: DecideStudioReviewDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{
        lesson_id: string;
        revision_id: string;
        requested_by: string;
        status: string;
        version: number;
      } & QueryResultRow>(
        `SELECT lesson_id,revision_id,requested_by,status,version
         FROM studio_review_requests
         WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [reviewId, institutionId],
      );
      const review = result.rows[0];
      if (!review) throw new NotFoundException("Studio review was not found");
      if (review.status !== "pending" || review.version !== input.expectedVersion) {
        throw new ConflictException("Studio review changed or is no longer pending");
      }
      if (review.requested_by === context.actorId) {
        throw new ConflictException("Studio review requires an independent reviewer");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_review_requests
         SET status=$3,reviewed_by=$4,reviewed_at=now(),decision_notes=$5,
             version=version+1
         WHERE id=$1 AND version=$2 RETURNING version`,
        [reviewId, input.expectedVersion, input.decision, context.actorId, input.notes.trim()],
      );
      await client.query(
        `UPDATE studio_lessons
         SET status=$2,version=version+1,updated_by=$3,updated_at=now()
         WHERE id=$1`,
        [review.lesson_id, input.decision === "approved" ? "in_review" : "draft", context.actorId],
      );
      await this.record(client, "studio.review.decided", "studio-review", reviewId, {
        lessonId: review.lesson_id,
        revisionId: review.revision_id,
        decision: input.decision,
        notes: input.notes.trim(),
        version: updated.rows[0].version,
      });
      return { id: reviewId, status: input.decision, version: updated.rows[0].version };
    });
  }

  async publish(institutionId: string, courseSpaceId: string, input: PublishCourseSpaceDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const spaceResult = await client.query<{
        id: string;
        status: string;
        version: number;
      } & QueryResultRow>(
        `SELECT id,status,version FROM studio_course_spaces
         WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [courseSpaceId, institutionId],
      );
      const space = spaceResult.rows[0];
      if (!space) throw new NotFoundException("Studio course space was not found");
      if (space.version !== input.expectedCourseSpaceVersion) {
        throw new ConflictException("Course space changed since it was loaded");
      }
      const review = await client.query(
        `SELECT review.id FROM studio_review_requests review
         JOIN studio_lessons lesson ON lesson.tenant_id=review.tenant_id AND lesson.id=review.lesson_id
         WHERE review.id=$1 AND lesson.course_space_id=$2 AND review.status='approved'`,
        [input.sourceReviewId, courseSpaceId],
      );
      if (!review.rowCount) throw new BadRequestException("Publication requires an approved Studio review");

      let manifest: Record<string, unknown>;
      if (input.rollbackOfSnapshotId) {
        const rollback = await client.query<{ manifest: Record<string, unknown> } & QueryResultRow>(
          `SELECT manifest FROM studio_publication_snapshots
           WHERE id=$1 AND course_space_id=$2`,
          [input.rollbackOfSnapshotId, courseSpaceId],
        );
        if (!rollback.rows[0]) throw new NotFoundException("Rollback publication snapshot was not found");
        manifest = rollback.rows[0].manifest;
      } else {
        const lessons = await client.query(
          `SELECT lesson.id,lesson.module_id,lesson.title,lesson.sequence_number,
                  lesson.lesson_type,lesson.estimated_minutes,lesson.availability_rule,
                  lesson.completion_rule,revision.id revision_id,
                  revision.revision_number,revision.block_document,revision.checksum_sha256
           FROM studio_lessons lesson
           JOIN studio_lesson_revisions revision
             ON revision.tenant_id=lesson.tenant_id AND revision.id=lesson.current_revision_id
           WHERE lesson.course_space_id=$1 AND lesson.status <> 'retired'
           ORDER BY lesson.module_id,lesson.sequence_number,lesson.id`,
          [courseSpaceId],
        );
        if (!lessons.rowCount) throw new ConflictException("Course space has no publishable lessons");
        for (const lesson of lessons.rows) {
          const approved = await client.query(
            `SELECT 1 FROM studio_review_requests
             WHERE lesson_id=$1 AND revision_id=$2 AND status='approved' LIMIT 1`,
            [lesson.id, lesson.revision_id],
          );
          if (!approved.rowCount) {
            throw new ConflictException(`Lesson ${lesson.title} does not have an approved current revision`);
          }
        }
        const modules = await client.query(
          `SELECT id,title,description,sequence_number,availability_rule,completion_rule
           FROM studio_modules WHERE course_space_id=$1 AND status <> 'retired'
           ORDER BY sequence_number,id`,
          [courseSpaceId],
        );
        manifest = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          courseSpaceId,
          modules: modules.rows,
          lessons: lessons.rows,
        };
      }
      const checksum = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `studio-publication:${courseSpaceId}`,
      ]);
      const next = await client.query<{ publication_number: number } & QueryResultRow>(
        `SELECT COALESCE(max(publication_number),0)+1 publication_number
         FROM studio_publication_snapshots WHERE course_space_id=$1`,
        [courseSpaceId],
      );
      const current = await client.query<{ id: string } & QueryResultRow>(
        `SELECT id FROM studio_publication_snapshots
         WHERE course_space_id=$1 AND status='current' FOR UPDATE`,
        [courseSpaceId],
      );
      if (current.rows[0]) {
        await client.query(
          `UPDATE studio_publication_snapshots SET status='superseded'
           WHERE id=$1`,
          [current.rows[0].id],
        );
      }
      const snapshotId = randomUUID();
      await client.query(
        `INSERT INTO studio_publication_snapshots (
           id,tenant_id,institution_id,course_space_id,publication_number,
           source_review_id,manifest,checksum_sha256,published_by,
           supersedes_snapshot_id,rollback_of_snapshot_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          snapshotId,
          context.tenantId,
          institutionId,
          courseSpaceId,
          Number(next.rows[0]?.publication_number ?? 1),
          input.sourceReviewId,
          manifest,
          checksum,
          context.actorId,
          current.rows[0]?.id ?? null,
          input.rollbackOfSnapshotId ?? null,
        ],
      );
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_course_spaces
         SET status='published',version=version+1,updated_by=$2,updated_at=now()
         WHERE id=$1 RETURNING version`,
        [courseSpaceId, context.actorId],
      );
      await client.query(
        `UPDATE studio_lessons
         SET status='published',updated_by=$2,updated_at=now()
         WHERE course_space_id=$1 AND status <> 'retired'`,
        [courseSpaceId, context.actorId],
      );
      await this.record(client, "studio.course-space.published", "studio-publication", snapshotId, {
        courseSpaceId,
        publicationNumber: Number(next.rows[0]?.publication_number ?? 1),
        checksum,
        supersedesSnapshotId: current.rows[0]?.id,
        rollbackOfSnapshotId: input.rollbackOfSnapshotId,
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      });
      return {
        id: snapshotId,
        courseSpaceId,
        publicationNumber: Number(next.rows[0]?.publication_number ?? 1),
        checksumSha256: checksum,
        courseSpaceVersion: updated.rows[0].version,
      };
    });
  }

  async analyseImport(institutionId: string, input: AnalyseCourseImportDto) {
    const context = this.context.require();
    const id = randomUUID();
    const supported = new Set([
      "title",
      "description",
      "modules",
      "lessons",
      "resources",
      "outcomes",
      "assignments",
      "discussions",
    ]);
    const keys = Object.keys(input.manifest);
    const unsupportedKeys = keys.filter((key) => !supported.has(key));
    const warnings: string[] = [];
    if (!Array.isArray(input.manifest.modules)) warnings.push("No module sequence was detected");
    if (!Array.isArray(input.manifest.lessons)) warnings.push("No lesson sequence was detected");
    const status = unsupportedKeys.length > 10
      ? "incompatible"
      : unsupportedKeys.length || warnings.length
        ? "compatible-with-warnings"
        : "compatible";
    const report = {
      schemaVersion: 1,
      sourceFormat: input.sourceFormat,
      compatible: status !== "incompatible",
      supportedKeys: keys.filter((key) => supported.has(key)),
      unsupportedKeys,
      warnings,
      checkedAt: new Date().toISOString(),
    };
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      if (input.courseSpaceId) await this.requireEditableSpace(client, institutionId, input.courseSpaceId);
      await client.query(
        `INSERT INTO studio_import_reports (
           id,tenant_id,institution_id,course_space_id,source_format,
           source_checksum,compatibility_status,report,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.courseSpaceId ?? null,
          input.sourceFormat,
          input.sourceChecksum,
          status,
          report,
          context.actorId,
        ],
      );
      await this.record(client, "studio.import.compatibility-analysed", "studio-import-report", id, {
        institutionId,
        sourceFormat: input.sourceFormat,
        compatibilityStatus: status,
        unsupportedCount: unsupportedKeys.length,
        version: 1,
      });
      return { id, compatibilityStatus: status, report };
    });
  }

  private validateBlocks(blocks: readonly StudioBlockDto[]) {
    const findings: ValidationFinding[] = [];
    const ids = new Set<string>();
    let wordCount = 0;
    let linkCount = 0;
    let mediaCount = 0;

    const visit = (block: StudioBlockDto, depth: number): void => {
      if (depth > 6) {
        findings.push({ code: "nesting-depth", severity: "error", blockId: block.id, message: "Block nesting exceeds six levels" });
      }
      if (ids.has(block.id)) {
        findings.push({ code: "duplicate-block-id", severity: "error", blockId: block.id, message: "Block identifiers must be unique" });
      }
      ids.add(block.id);
      const textValues = Object.values(block.data).filter((value): value is string => typeof value === "string");
      for (const text of textValues) wordCount += text.trim().split(/\s+/).filter(Boolean).length;
      if (block.type === "image" && block.data.decorative !== true) {
        const alt = typeof block.data.altText === "string" ? block.data.altText.trim() : "";
        if (!alt) findings.push({ code: "image-alt-missing", severity: "error", blockId: block.id, message: "Meaningful images require alternative text" });
        mediaCount += 1;
      }
      if (["video", "audio"].includes(block.type)) {
        const captions = typeof block.data.captions === "string" ? block.data.captions.trim() : "";
        const transcript = typeof block.data.transcript === "string" ? block.data.transcript.trim() : "";
        if (!captions && !transcript) findings.push({ code: "media-caption-missing", severity: "error", blockId: block.id, message: "Audio and video require captions or a transcript" });
        mediaCount += 1;
      }
      for (const [key, value] of Object.entries(block.data)) {
        if ((key.toLowerCase().includes("url") || key.toLowerCase().includes("href")) && typeof value === "string") {
          linkCount += 1;
          try {
            const url = new URL(value);
            if (url.protocol !== "https:") throw new Error("invalid protocol");
          } catch {
            findings.push({ code: "invalid-link", severity: "error", blockId: block.id, message: "Links must use a valid HTTPS URL" });
          }
        }
      }
      block.children?.forEach((child) => visit(child, depth + 1));
    };
    blocks.forEach((block) => visit(block, 1));
    if (wordCount > 3000) findings.push({ code: "reading-load-high", severity: "warning", message: "Lesson reading load exceeds 3,000 words" });
    if (blocks.length === 0) findings.push({ code: "empty-document", severity: "error", message: "A lesson must contain at least one structured block" });
    const accessibilityFindings = findings.filter((finding) => !["invalid-link"].includes(finding.code));
    const linkFindings = findings.filter((finding) => finding.code === "invalid-link");
    return {
      accessibility: {
        passed: !accessibilityFindings.some((finding) => finding.severity === "error"),
        findings: accessibilityFindings,
        checkedAt: new Date().toISOString(),
      },
      links: {
        passed: !linkFindings.some((finding) => finding.severity === "error"),
        findings: linkFindings,
        checkedAt: new Date().toISOString(),
      },
      reading: {
        wordCount,
        estimatedMinutes: Math.max(1, Math.ceil(wordCount / 220)),
        linkCount,
        mediaCount,
      },
    };
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const institution = await client.query(
      `SELECT id FROM institutions WHERE id=$1 AND status='active'`,
      [institutionId],
    );
    if (!institution.rowCount) throw new NotFoundException("Active institution was not found");
  }

  private async requireEditableSpace(client: PoolClient, institutionId: string, courseSpaceId: string) {
    const result = await client.query(
      `SELECT id,status FROM studio_course_spaces
       WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
      [courseSpaceId, institutionId],
    );
    if (!result.rows[0]) throw new NotFoundException("Studio course space was not found");
    if (result.rows[0].status === "retired") throw new ConflictException("Retired course spaces cannot be edited");
    return result.rows[0];
  }

  private async bumpSpace(client: PoolClient, courseSpaceId: string): Promise<void> {
    const context = this.context.require();
    await client.query(
      `UPDATE studio_course_spaces
       SET status='draft',version=version+1,updated_by=$2,updated_at=now()
       WHERE id=$1`,
      [courseSpaceId, context.actorId],
    );
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
