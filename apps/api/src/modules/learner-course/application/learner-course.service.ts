import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  ApplyLearnerSyncOperationDto,
  CreateBookmarkDto,
  CreateDiscussionPostDto,
  CreateOfflineManifestDto,
  RecordCompletionEvidenceDto,
} from "./learner-course.dto.js";

interface LearnerContextRow extends QueryResultRow {
  person_id: string;
}

interface EnrolmentContextRow extends QueryResultRow {
  id: string;
  institution_id: string;
  learner_person_id: string;
  course_run_id: string;
  course_title: string;
  delivery_mode: string;
  starts_on: string;
  ends_on: string;
  publication_id: string;
  publication_checksum: string;
  manifest: Record<string, unknown>;
}

interface ManifestLesson {
  id: string;
  module_id?: string;
  moduleId?: string;
  title: string;
  summary?: string;
  sequence_number?: number;
  sequenceNumber?: number;
  estimated_minutes?: number;
  estimatedMinutes?: number;
  availability_rule?: Record<string, unknown>;
  availabilityRule?: Record<string, unknown>;
  completion_rule?: Record<string, unknown>;
  completionRule?: Record<string, unknown>;
  block_document?: readonly Record<string, unknown>[];
  blocks?: readonly Record<string, unknown>[];
}

interface ManifestModule {
  id: string;
  title: string;
  description?: string;
  sequence_number?: number;
  sequenceNumber?: number;
}

@Injectable()
export class LearnerCourseService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async home() {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      const enrolments = await client.query(
        `SELECT enrolment.id "enrolmentId",run.id "courseRunId",run.title "courseTitle",
                run.delivery_mode "deliveryMode",run.starts_on "startsOn",run.ends_on "endsOn"
         FROM enrolments enrolment
         JOIN course_runs run ON run.tenant_id=enrolment.tenant_id AND run.id=enrolment.course_run_id
         WHERE enrolment.learner_person_id=$1
           AND enrolment.status IN ('pending','active') AND enrolment.effective_until IS NULL
           AND run.lifecycle IN ('scheduled','open','in_progress')
         ORDER BY run.starts_on,run.title`,
        [learnerPersonId],
      );
      const courses: Record<string, unknown>[] = [];
      const today: Record<string, unknown>[] = [];
      for (const enrolment of enrolments.rows) {
        const room = await this.loadRoomWithin(client, learnerPersonId, enrolment.enrolmentId, true);
        const nextLesson = this.flattenLessons(room.modules).find((lesson) => !lesson.completed);
        courses.push({
          ...enrolment,
          progressPercent: room.progressPercent,
          completedLessons: room.completedLessons,
          totalLessons: room.totalLessons,
          nextLessonId: nextLesson?.id,
          nextLessonTitle: nextLesson?.title,
        });
        if (nextLesson) {
          today.push({
            kind: "lesson",
            id: nextLesson.id,
            courseRunId: enrolment.courseRunId,
            courseTitle: enrolment.courseTitle,
            title: nextLesson.title,
            href: `/courses/${enrolment.enrolmentId}`,
            priority: 50,
          });
        }
      }
      const upcoming = await client.query(
        `SELECT slot.id,slot.course_run_id "courseRunId",run.title "courseTitle",
                COALESCE(section.title,run.title) title,slot.starts_at "startsAt"
         FROM timetable_slots slot
         JOIN course_runs run ON run.tenant_id=slot.tenant_id AND run.id=slot.course_run_id
         LEFT JOIN class_sections section
           ON section.tenant_id=slot.tenant_id AND section.id=slot.class_section_id
         JOIN enrolments enrolment
           ON enrolment.tenant_id=slot.tenant_id
          AND enrolment.course_run_id=slot.course_run_id
          AND enrolment.learner_person_id=$1
          AND enrolment.status IN ('pending','active')
          AND enrolment.effective_until IS NULL
          AND (slot.class_section_id IS NULL OR enrolment.class_section_id=slot.class_section_id)
         WHERE slot.status='scheduled'
           AND slot.starts_at >= now() AND slot.starts_at < now() + interval '48 hours'
         ORDER BY slot.starts_at LIMIT 20`,
        [learnerPersonId],
      );
      for (const event of upcoming.rows) {
        today.push({
          kind: "event",
          id: event.id,
          courseRunId: event.courseRunId,
          courseTitle: event.courseTitle,
          title: event.title,
          startsAt: event.startsAt,
          href: "/calendar",
          priority: 80,
        });
      }
      return {
        learnerPersonId,
        today: today.sort((left, right) => Number(right.priority) - Number(left.priority)),
        courses,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async courseRoom(enrolmentId: string, lowBandwidth = false) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      return this.loadRoomWithin(client, learnerPersonId, enrolmentId, lowBandwidth);
    });
  }

  async recordEvidence(enrolmentId: string, input: RecordCompletionEvidenceDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      const enrolment = await this.requireCurrentEnrolment(client, learnerPersonId, enrolmentId);
      await this.requireVisibleLesson(client, enrolment, input.lessonId);
      const id = randomUUID();
      const result = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO learner_completion_evidence (
           id,tenant_id,institution_id,learner_person_id,enrolment_id,lesson_id,
           evidence_type,evidence_key,evidence,occurred_at,recorded_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)
         ON CONFLICT (tenant_id,enrolment_id,lesson_id,evidence_type,evidence_key)
         DO UPDATE SET evidence=EXCLUDED.evidence,occurred_at=EXCLUDED.occurred_at,
                       recorded_by=EXCLUDED.recorded_by
         RETURNING id`,
        [
          id,
          context.tenantId,
          enrolment.institution_id,
          learnerPersonId,
          enrolmentId,
          input.lessonId,
          input.evidenceType,
          input.evidenceKey.trim(),
          input.evidence,
          context.actorId,
        ],
      );
      const progress = await this.computeProgress(client, enrolment);
      await this.record(client, "learning.completion-evidence.recorded", "learner-evidence", result.rows[0].id, {
        enrolmentId,
        lessonId: input.lessonId,
        evidenceType: input.evidenceType,
        evidenceKey: input.evidenceKey.trim(),
        progressPercent: progress.progressPercent,
        version: 1,
      });
      return { id: result.rows[0].id, progress };
    });
  }

  async createBookmark(enrolmentId: string, input: CreateBookmarkDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      const enrolment = await this.requireCurrentEnrolment(client, learnerPersonId, enrolmentId);
      await this.requireVisibleLesson(client, enrolment, input.lessonId);
      const id = randomUUID();
      const result = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO learner_bookmarks (
           id,tenant_id,institution_id,learner_person_id,enrolment_id,lesson_id,block_id,note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id,learner_person_id,enrolment_id,lesson_id,block_id)
         DO UPDATE SET note=EXCLUDED.note
         RETURNING id`,
        [
          id,
          context.tenantId,
          enrolment.institution_id,
          learnerPersonId,
          enrolmentId,
          input.lessonId,
          input.blockId ?? null,
          input.note?.trim() || null,
        ],
      );
      await this.record(client, "learning.bookmark.saved", "learner-bookmark", result.rows[0].id, {
        enrolmentId,
        lessonId: input.lessonId,
        blockId: input.blockId,
        version: 1,
      });
      return { id: result.rows[0].id };
    });
  }

  async createDiscussionPost(enrolmentId: string, input: CreateDiscussionPostDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      const enrolment = await this.requireCurrentEnrolment(client, learnerPersonId, enrolmentId);
      const discussion = await client.query(
        `SELECT id,lesson_id FROM course_discussions
         WHERE id=$1 AND course_run_id=$2 AND status='open'
           AND (available_from IS NULL OR available_from <= now())
           AND (available_until IS NULL OR available_until > now())`,
        [input.discussionId, enrolment.course_run_id],
      );
      if (!discussion.rows[0]) throw new NotFoundException("Open course discussion was not found");
      if (input.parentPostId) {
        const parent = await client.query(
          `SELECT id FROM course_discussion_posts
           WHERE id=$1 AND discussion_id=$2 AND status='visible'`,
          [input.parentPostId, input.discussionId],
        );
        if (!parent.rowCount) throw new BadRequestException("Parent discussion post was not found");
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO course_discussion_posts (
           id,tenant_id,institution_id,discussion_id,author_person_id,parent_post_id,
           body,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          id,
          context.tenantId,
          enrolment.institution_id,
          input.discussionId,
          learnerPersonId,
          input.parentPostId ?? null,
          input.body.trim(),
          context.actorId,
        ],
      );
      if (discussion.rows[0].lesson_id) {
        await client.query(
          `INSERT INTO learner_completion_evidence (
             id,tenant_id,institution_id,learner_person_id,enrolment_id,lesson_id,
             evidence_type,evidence_key,evidence,occurred_at,recorded_by
           ) VALUES ($1,$2,$3,$4,$5,$6,'discussion-posted',$7,$8,now(),$9)
           ON CONFLICT DO NOTHING`,
          [
            randomUUID(),
            context.tenantId,
            enrolment.institution_id,
            learnerPersonId,
            enrolmentId,
            discussion.rows[0].lesson_id,
            id,
            { discussionId: input.discussionId, postId: id },
            context.actorId,
          ],
        );
      }
      await this.record(client, "learning.discussion.posted", "discussion-post", id, {
        enrolmentId,
        discussionId: input.discussionId,
        version: 1,
      });
      return { id, status: "visible", version: 1 };
    });
  }

  async createOfflineManifest(enrolmentId: string, input: CreateOfflineManifestDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      const room = await this.loadRoomWithin(
        client,
        learnerPersonId,
        enrolmentId,
        input.mode === "low-bandwidth",
      );
      const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        mode: input.mode ?? "full",
        course: room,
      };
      const checksum = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
      const id = randomUUID();
      await client.query(
        `INSERT INTO learner_offline_manifests (
           id,tenant_id,institution_id,learner_person_id,enrolment_id,
           publication_snapshot_id,manifest_checksum,manifest,expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '7 days')
         ON CONFLICT (tenant_id,learner_person_id,enrolment_id,publication_snapshot_id,manifest_checksum)
         DO UPDATE SET expires_at=now()+interval '7 days',revoked_at=NULL
         RETURNING id`,
        [
          id,
          context.tenantId,
          room.institutionId,
          learnerPersonId,
          enrolmentId,
          room.publicationSnapshotId,
          checksum,
          manifest,
        ],
      );
      return { id, checksumSha256: checksum, expiresAt: new Date(Date.now() + 604800000).toISOString(), manifest };
    });
  }

  async applySyncOperation(enrolmentId: string, input: ApplyLearnerSyncOperationDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learnerPersonId = await this.requireLearnerPerson(client);
      const enrolment = await this.requireCurrentEnrolment(client, learnerPersonId, enrolmentId);
      const existing = await client.query(
        `SELECT id,status,rejection_reason "rejectionReason" FROM learner_sync_operations
         WHERE learner_person_id=$1 AND device_operation_id=$2`,
        [learnerPersonId, input.deviceOperationId],
      );
      if (existing.rows[0]) return existing.rows[0];
      const id = randomUUID();
      await client.query(
        `INSERT INTO learner_sync_operations (
           id,tenant_id,institution_id,learner_person_id,enrolment_id,
           device_operation_id,operation_type,payload,status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'accepted')`,
        [
          id,
          context.tenantId,
          enrolment.institution_id,
          learnerPersonId,
          enrolmentId,
          input.deviceOperationId,
          input.operationType,
          input.payload,
        ],
      );
      try {
        if (input.operationType === "bookmark") {
          const lessonId = this.requirePayloadString(input.payload, "lessonId");
          await this.requireVisibleLesson(client, enrolment, lessonId);
          await client.query(
            `INSERT INTO learner_bookmarks (
               id,tenant_id,institution_id,learner_person_id,enrolment_id,lesson_id,block_id,note
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT DO NOTHING`,
            [
              randomUUID(),
              context.tenantId,
              enrolment.institution_id,
              learnerPersonId,
              enrolmentId,
              lessonId,
              typeof input.payload.blockId === "string" ? input.payload.blockId : null,
              typeof input.payload.note === "string" ? input.payload.note : null,
            ],
          );
        } else if (input.operationType === "completion") {
          const lessonId = this.requirePayloadString(input.payload, "lessonId");
          await this.requireVisibleLesson(client, enrolment, lessonId);
          await client.query(
            `INSERT INTO learner_completion_evidence (
               id,tenant_id,institution_id,learner_person_id,enrolment_id,lesson_id,
               evidence_type,evidence_key,evidence,occurred_at,recorded_by
             ) VALUES ($1,$2,$3,$4,$5,$6,'activity-completed',$7,$8,now(),$9)
             ON CONFLICT DO NOTHING`,
            [
              randomUUID(),
              context.tenantId,
              enrolment.institution_id,
              learnerPersonId,
              enrolmentId,
              lessonId,
              input.deviceOperationId,
              input.payload,
              context.actorId,
            ],
          );
        } else {
          const discussionId = this.requirePayloadString(input.payload, "discussionId");
          const body = this.requirePayloadString(input.payload, "body");
          const discussion = await client.query(
            `SELECT id FROM course_discussions
             WHERE id=$1 AND course_run_id=$2 AND status='open'`,
            [discussionId, enrolment.course_run_id],
          );
          if (!discussion.rowCount) throw new BadRequestException("Discussion is not available");
          await client.query(
            `INSERT INTO course_discussion_posts (
               id,tenant_id,institution_id,discussion_id,author_person_id,body,created_by,updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
            [randomUUID(), context.tenantId, enrolment.institution_id, discussionId, learnerPersonId, body, context.actorId],
          );
        }
        await client.query(
          `UPDATE learner_sync_operations SET status='applied',applied_at=now() WHERE id=$1`,
          [id],
        );
        return { id, status: "applied" };
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 1000) : "Sync operation was rejected";
        await client.query(
          `UPDATE learner_sync_operations SET status='rejected',rejection_reason=$2 WHERE id=$1`,
          [id, reason],
        );
        return { id, status: "rejected", rejectionReason: reason };
      }
    });
  }

  private async loadRoomWithin(
    client: PoolClient,
    learnerPersonId: string,
    enrolmentId: string,
    lowBandwidth: boolean,
  ) {
    const enrolment = await this.requireCurrentEnrolment(client, learnerPersonId, enrolmentId);
    const contextResult = await client.query<EnrolmentContextRow>(
      `SELECT enrolment.id,enrolment.institution_id,enrolment.learner_person_id,
              enrolment.course_run_id,run.title course_title,run.delivery_mode,
              run.starts_on,run.ends_on,snapshot.id publication_id,
              snapshot.checksum_sha256 publication_checksum,snapshot.manifest
       FROM enrolments enrolment
       JOIN course_runs run ON run.tenant_id=enrolment.tenant_id AND run.id=enrolment.course_run_id
       JOIN studio_course_spaces space
         ON space.tenant_id=run.tenant_id
        AND space.course_blueprint_version_id=run.course_blueprint_version_id
       JOIN studio_publication_snapshots snapshot
         ON snapshot.tenant_id=space.tenant_id AND snapshot.course_space_id=space.id
        AND snapshot.status='current'
       WHERE enrolment.id=$1 AND enrolment.learner_person_id=$2`,
      [enrolmentId, learnerPersonId],
    );
    const course = contextResult.rows[0];
    if (!course) throw new NotFoundException("Published learner course room was not found");
    const progress = await this.computeProgress(client, course);
    const manifestModules = this.manifestArray<ManifestModule>(course.manifest, "modules");
    const manifestLessons = this.manifestArray<ManifestLesson>(course.manifest, "lessons");
    const completed = new Set(progress.completedLessonIds);
    const bookmarks = await client.query<{ lesson_id: string } & QueryResultRow>(
      `SELECT lesson_id FROM learner_bookmarks WHERE enrolment_id=$1`,
      [enrolmentId],
    );
    const bookmarked = new Set(bookmarks.rows.map((row) => row.lesson_id));
    const now = new Date();
    const visibleLessons = manifestLessons.filter((lesson) =>
      this.isAvailable(lesson.availabilityRule ?? lesson.availability_rule ?? {}, now, completed),
    );
    const modules = manifestModules.map((module) => {
      const lessons = visibleLessons
        .filter((lesson) => (lesson.moduleId ?? lesson.module_id) === module.id)
        .sort((left, right) => this.sequence(left) - this.sequence(right))
        .map((lesson) => ({
          id: lesson.id,
          moduleId: module.id,
          title: lesson.title,
          summary: lesson.summary,
          sequenceNumber: this.sequence(lesson),
          estimatedMinutes: lesson.estimatedMinutes ?? lesson.estimated_minutes,
          blocks: this.transformBlocks(lesson.blocks ?? lesson.block_document ?? [], lowBandwidth),
          completionRule: lesson.completionRule ?? lesson.completion_rule ?? {},
          completed: completed.has(lesson.id),
          bookmarked: bookmarked.has(lesson.id),
        }));
      const moduleCompleted = lessons.filter((lesson) => lesson.completed).length;
      return {
        id: module.id,
        title: module.title,
        description: module.description,
        sequenceNumber: module.sequenceNumber ?? module.sequence_number ?? 0,
        completionPercent: lessons.length ? Number(((moduleCompleted / lessons.length) * 100).toFixed(2)) : 0,
        lessons,
      };
    });
    const [announcements, timetable, discussions] = await Promise.all([
      client.query(
        `SELECT id,title,body,publish_at "publishAt",expires_at "expiresAt"
         FROM course_announcements
         WHERE course_run_id=$1 AND status='published'
           AND (publish_at IS NULL OR publish_at <= now())
           AND (expires_at IS NULL OR expires_at > now())
         ORDER BY publish_at DESC NULLS LAST,created_at DESC`,
        [course.course_run_id],
      ),
      client.query(
        `SELECT id,class_section_id "classSectionId",starts_at "startsAt",ends_at "endsAt",
                timezone,delivery_mode "deliveryMode",room_key "roomKey",
                location_label "locationLabel",online_join_url "onlineJoinUrl"
         FROM timetable_slots
         WHERE course_run_id=$1 AND status='scheduled'
           AND starts_at >= now()-interval '1 day'
         ORDER BY starts_at LIMIT 100`,
        [course.course_run_id],
      ),
      client.query(
        `SELECT id,lesson_id "lessonId",title,prompt,status,
                available_from "availableFrom",available_until "availableUntil"
         FROM course_discussions
         WHERE course_run_id=$1 AND status IN ('open','locked')
           AND (available_from IS NULL OR available_from <= now())
           AND (available_until IS NULL OR available_until > now())
         ORDER BY created_at`,
        [course.course_run_id],
      ),
    ]);
    return {
      institutionId: course.institution_id,
      enrolmentId,
      courseRunId: course.course_run_id,
      courseTitle: course.course_title,
      publicationSnapshotId: course.publication_id,
      publicationChecksum: course.publication_checksum,
      progressPercent: progress.progressPercent,
      completedLessons: progress.completedLessons,
      totalLessons: progress.totalLessons,
      modules,
      announcements: announcements.rows,
      timetable: timetable.rows,
      discussions: discussions.rows,
      offlineAvailable: true,
      dataFreshness: new Date().toISOString(),
    };
  }

  private async computeProgress(client: PoolClient, enrolment: EnrolmentContextRow | any) {
    let publicationId = enrolment.publication_id as string | undefined;
    let manifest = enrolment.manifest as Record<string, unknown> | undefined;
    if (!publicationId || !manifest) {
      const publication = await client.query<{
        id: string;
        manifest: Record<string, unknown>;
      } & QueryResultRow>(
        `SELECT snapshot.id,snapshot.manifest
         FROM course_runs run
         JOIN studio_course_spaces space
           ON space.tenant_id=run.tenant_id
          AND space.course_blueprint_version_id=run.course_blueprint_version_id
         JOIN studio_publication_snapshots snapshot
           ON snapshot.tenant_id=space.tenant_id AND snapshot.course_space_id=space.id
          AND snapshot.status='current'
         WHERE run.id=$1`,
        [enrolment.course_run_id],
      );
      publicationId = publication.rows[0]?.id;
      manifest = publication.rows[0]?.manifest;
    }
    if (!publicationId || !manifest) {
      return { progressPercent: 0, completedLessons: 0, totalLessons: 0, completedLessonIds: [] as string[] };
    }
    const lessons = this.manifestArray<ManifestLesson>(manifest, "lessons");
    const evidence = await client.query<{
      lesson_id: string;
      evidence_type: string;
      evidence_key: string;
      occurred_at: string;
    } & QueryResultRow>(
      `SELECT lesson_id,evidence_type,evidence_key,occurred_at
       FROM learner_completion_evidence WHERE enrolment_id=$1 ORDER BY occurred_at,id`,
      [enrolment.id],
    );
    const byLesson = new Map<string, Set<string>>();
    for (const row of evidence.rows) {
      const set = byLesson.get(row.lesson_id) ?? new Set<string>();
      set.add(row.evidence_type);
      byLesson.set(row.lesson_id, set);
    }
    const completedLessonIds = lessons
      .filter((lesson) => this.completionSatisfied(lesson.completionRule ?? lesson.completion_rule ?? {}, byLesson.get(lesson.id) ?? new Set()))
      .map((lesson) => lesson.id);
    const totalLessons = lessons.length;
    const completedLessons = completedLessonIds.length;
    const progressPercent = totalLessons ? Number(((completedLessons / totalLessons) * 100).toFixed(4)) : 0;
    const evidenceChecksum = createHash("sha256")
      .update(JSON.stringify(evidence.rows))
      .digest("hex");
    const nextLesson = lessons
      .sort((left, right) => this.sequence(left) - this.sequence(right))
      .find((lesson) => !completedLessonIds.includes(lesson.id));
    await client.query(
      `INSERT INTO learner_progress_snapshots (
         id,tenant_id,institution_id,learner_person_id,enrolment_id,
         publication_snapshot_id,evidence_checksum,completed_lessons,total_lessons,
         progress_percent,next_lesson_id,computation
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id,enrolment_id,publication_snapshot_id,evidence_checksum)
       DO NOTHING`,
      [
        randomUUID(),
        this.context.require().tenantId,
        enrolment.institution_id,
        enrolment.learner_person_id,
        enrolment.id,
        publicationId,
        evidenceChecksum,
        completedLessons,
        totalLessons,
        progressPercent,
        nextLesson?.id ?? null,
        { completedLessonIds, evidenceCount: evidence.rowCount },
      ],
    );
    return { progressPercent, completedLessons, totalLessons, completedLessonIds };
  }

  private completionSatisfied(rule: Record<string, unknown>, evidence: ReadonlySet<string>): boolean {
    const required = Array.isArray(rule.requiredEvidenceTypes)
      ? rule.requiredEvidenceTypes.filter((value): value is string => typeof value === "string")
      : [];
    if (required.length) return required.every((type) => evidence.has(type));
    const mode = typeof rule.type === "string" ? rule.type : "any-evidence";
    if (mode === "manual") return evidence.has("manual-completion");
    if (mode === "viewed") return evidence.has("viewed") || evidence.has("acknowledged");
    return evidence.size > 0;
  }

  private isAvailable(
    rule: Record<string, unknown>,
    now: Date,
    completedLessonIds: ReadonlySet<string>,
  ): boolean {
    if (rule.hidden === true) return false;
    if (typeof rule.availableFrom === "string" && now < new Date(rule.availableFrom)) return false;
    if (typeof rule.availableUntil === "string" && now >= new Date(rule.availableUntil)) return false;
    if (Array.isArray(rule.prerequisiteLessonIds)) {
      const required = rule.prerequisiteLessonIds.filter((value): value is string => typeof value === "string");
      if (!required.every((id) => completedLessonIds.has(id))) return false;
    }
    return true;
  }

  private transformBlocks(blocks: readonly Record<string, unknown>[], lowBandwidth: boolean): readonly Record<string, unknown>[] {
    if (!lowBandwidth) return blocks;
    return blocks.map((block) => {
      const type = block.type;
      if (["video", "audio", "image"].includes(String(type))) {
        const data = typeof block.data === "object" && block.data !== null ? block.data as Record<string, unknown> : {};
        return {
          ...block,
          data: {
            altText: data.altText,
            captions: data.captions,
            transcript: data.transcript,
            title: data.title,
            lowBandwidthPlaceholder: true,
          },
        };
      }
      const children = Array.isArray(block.children)
        ? this.transformBlocks(block.children as Record<string, unknown>[], true)
        : block.children;
      return { ...block, children };
    });
  }

  private async requireLearnerPerson(client: PoolClient): Promise<string> {
    const context = this.context.require();
    const result = await client.query<LearnerContextRow>(
      `SELECT person.id person_id FROM people person
       JOIN learner_profiles profile ON profile.tenant_id=person.tenant_id AND profile.person_id=person.id
       WHERE person.linked_user_id=$1 AND person.status='active'
         AND profile.status IN ('prospective','active','completed')
       ORDER BY CASE profile.status WHEN 'active' THEN 0 ELSE 1 END,profile.created_at DESC
       LIMIT 1`,
      [context.actorId],
    );
    if (!result.rows[0]) {
      throw new ForbiddenException("Authenticated identity is not linked to an active learner profile");
    }
    return result.rows[0].person_id;
  }

  private async requireCurrentEnrolment(
    client: PoolClient,
    learnerPersonId: string,
    enrolmentId: string,
  ) {
    const result = await client.query<{
      id: string;
      institution_id: string;
      learner_person_id: string;
      course_run_id: string;
      status: string;
    } & QueryResultRow>(
      `SELECT id,institution_id,learner_person_id,course_run_id,status
       FROM enrolments
       WHERE id=$1 AND learner_person_id=$2
         AND status IN ('pending','active') AND effective_until IS NULL`,
      [enrolmentId, learnerPersonId],
    );
    if (!result.rows[0]) throw new NotFoundException("Current learner enrolment was not found");
    return result.rows[0];
  }

  private async requireVisibleLesson(client: PoolClient, enrolment: any, lessonId: string): Promise<void> {
    const publication = await client.query<{ manifest: Record<string, unknown> } & QueryResultRow>(
      `SELECT snapshot.manifest
       FROM course_runs run
       JOIN studio_course_spaces space
         ON space.tenant_id=run.tenant_id
        AND space.course_blueprint_version_id=run.course_blueprint_version_id
       JOIN studio_publication_snapshots snapshot
         ON snapshot.tenant_id=space.tenant_id AND snapshot.course_space_id=space.id
        AND snapshot.status='current'
       WHERE run.id=$1`,
      [enrolment.course_run_id],
    );
    const manifest = publication.rows[0]?.manifest;
    if (!manifest) throw new NotFoundException("Published course content was not found");
    const lessons = this.manifestArray<ManifestLesson>(manifest, "lessons");
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) throw new NotFoundException("Lesson is not part of the published course snapshot");
    const evidence = await client.query<{ lesson_id: string } & QueryResultRow>(
      `SELECT DISTINCT lesson_id FROM learner_completion_evidence WHERE enrolment_id=$1`,
      [enrolment.id],
    );
    const completed = new Set(evidence.rows.map((row) => row.lesson_id));
    if (!this.isAvailable(lesson.availabilityRule ?? lesson.availability_rule ?? {}, new Date(), completed)) {
      throw new ForbiddenException("Lesson is hidden or not yet available");
    }
  }

  private manifestArray<T>(manifest: Record<string, unknown>, key: string): T[] {
    return Array.isArray(manifest[key]) ? manifest[key] as T[] : [];
  }

  private sequence(record: ManifestLesson): number {
    return record.sequenceNumber ?? record.sequence_number ?? 0;
  }

  private flattenLessons(modules: readonly any[]): any[] {
    return modules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  }

  private requirePayloadString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Sync payload requires ${key}`);
    }
    return value.trim();
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
