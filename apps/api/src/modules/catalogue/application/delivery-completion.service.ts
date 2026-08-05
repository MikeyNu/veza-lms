import { randomUUID } from "node:crypto";
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
  ChangeOfferingStatusDto,
  CreateOfferingDto,
  CreateTimetableSlotDto,
  PromoteWaitlistEntryDto,
  ReinstateEnrolmentDto,
  UpsertRunOverlayDto,
} from "./delivery-completion.dto.js";

interface OfferingRow extends QueryResultRow {
  id: string;
  course_run_id: string;
  status: string;
  waitlist_enabled: boolean;
  version: number;
}

interface EnrolmentRow extends QueryResultRow {
  id: string;
  institution_id: string;
  learner_person_id: string;
  course_run_id: string;
  status: string;
  version: number;
}

@Injectable()
export class DeliveryCompletionService {
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
      const [offerings, overlays, timetable, waitlist] = await Promise.all([
        client.query(
          `SELECT offering.id,offering.institution_id "institutionId",
                  offering.course_run_id "courseRunId",offering.code,offering.title,
                  offering.registration_mode "registrationMode",offering.status,
                  offering.opens_at "opensAt",offering.closes_at "closesAt",
                  COALESCE(offering.capacity_override,run.capacity) capacity,
                  count(enrolment.id) FILTER (
                    WHERE enrolment.status IN ('pending','active') AND enrolment.effective_until IS NULL
                  )::int occupied,
                  CASE
                    WHEN COALESCE(offering.capacity_override,run.capacity) IS NULL THEN NULL
                    ELSE greatest(COALESCE(offering.capacity_override,run.capacity) -
                      count(enrolment.id) FILTER (
                        WHERE enrolment.status IN ('pending','active') AND enrolment.effective_until IS NULL
                      ),0)::int
                  END available,
                  offering.waitlist_enabled "waitlistEnabled",
                  count(waitlist.id) FILTER (WHERE waitlist.status='waiting')::int "waitlistCount",
                  offering.version
           FROM course_offerings offering
           JOIN course_runs run ON run.tenant_id=offering.tenant_id AND run.id=offering.course_run_id
           LEFT JOIN enrolments enrolment
             ON enrolment.tenant_id=offering.tenant_id AND enrolment.offering_id=offering.id
           LEFT JOIN waitlist_entries waitlist
             ON waitlist.tenant_id=offering.tenant_id AND waitlist.offering_id=offering.id
           WHERE offering.institution_id=$1
           GROUP BY offering.id,run.capacity
           ORDER BY offering.created_at DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT id,institution_id "institutionId",course_run_id "courseRunId",
                  overlay,version
           FROM course_run_overlays
           WHERE institution_id=$1
           ORDER BY updated_at DESC`,
          [institutionId],
        ),
        client.query(
          `SELECT id,institution_id "institutionId",course_run_id "courseRunId",
                  class_section_id "classSectionId",starts_at "startsAt",ends_at "endsAt",
                  timezone,delivery_mode "deliveryMode",room_key "roomKey",
                  location_label "locationLabel",online_join_url "onlineJoinUrl",
                  recurrence_key "recurrenceKey",status,version
           FROM timetable_slots
           WHERE institution_id=$1
           ORDER BY starts_at,id`,
          [institutionId],
        ),
        client.query(
          `SELECT entry.id,entry.institution_id "institutionId",entry.offering_id "offeringId",
                  entry.learner_person_id "learnerPersonId",
                  concat_ws(' ',person.preferred_name,person.legal_family_name) "learnerDisplayName",
                  entry.requested_at "requestedAt",entry.priority,entry.position,entry.status,
                  entry.offer_expires_at "offerExpiresAt",
                  entry.promoted_enrolment_id "promotedEnrolmentId",entry.version
           FROM waitlist_entries entry
           JOIN people person ON person.tenant_id=entry.tenant_id AND person.id=entry.learner_person_id
           WHERE entry.institution_id=$1
           ORDER BY entry.status,entry.priority DESC,entry.position,entry.requested_at`,
          [institutionId],
        ),
      ]);
      return {
        institutionId,
        offerings: offerings.rows,
        overlays: overlays.rows,
        timetable: timetable.rows,
        waitlist: waitlist.rows,
      };
    });
  }

  async createOffering(institutionId: string, input: CreateOfferingDto) {
    if (input.closesAt && input.opensAt && input.closesAt <= input.opensAt) {
      throw new BadRequestException("Offering close time must follow its open time");
    }
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const run = await client.query<{
        id: string;
        lifecycle: string;
        starts_on: string;
        ends_on: string;
      } & QueryResultRow>(
        `SELECT id,lifecycle,starts_on,ends_on FROM course_runs
         WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [input.courseRunId, institutionId],
      );
      const current = run.rows[0];
      if (!current) throw new NotFoundException("Course run was not found");
      if (["completed", "cancelled"].includes(current.lifecycle)) {
        throw new ConflictException("Closed course runs cannot receive new offerings");
      }
      await client.query(
        `INSERT INTO course_offerings (
           id,tenant_id,institution_id,course_run_id,code,title,registration_mode,
           opens_at,closes_at,capacity_override,waitlist_enabled,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.courseRunId,
          input.code.trim().toUpperCase(),
          input.title.trim(),
          input.registrationMode,
          input.opensAt ?? null,
          input.closesAt ?? null,
          input.capacityOverride ?? null,
          input.waitlistEnabled,
          context.actorId,
        ],
      );
      await this.record(client, "delivery.offering.created", "course-offering", id, {
        institutionId,
        courseRunId: input.courseRunId,
        code: input.code.trim().toUpperCase(),
        registrationMode: input.registrationMode,
        waitlistEnabled: input.waitlistEnabled,
        version: 1,
      });
      return { id, status: "draft", version: 1 };
    });
  }

  async changeOfferingStatus(
    institutionId: string,
    offeringId: string,
    input: ChangeOfferingStatusDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<OfferingRow>(
        `SELECT id,course_run_id,status,waitlist_enabled,version
         FROM course_offerings
         WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [offeringId, institutionId],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Course offering was not found");
      if (current.version !== input.expectedVersion) {
        throw new ConflictException("Course offering changed since it was loaded");
      }
      const allowed: Readonly<Record<string, readonly string[]>> = {
        draft: ["open", "cancelled"],
        open: ["closed", "cancelled"],
        closed: ["completed", "open", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!allowed[current.status]?.includes(input.status)) {
        throw new ConflictException(
          `Offering cannot move from ${current.status} to ${input.status}`,
        );
      }
      if (input.status === "completed") {
        const unresolved = await client.query(
          `SELECT 1 FROM waitlist_entries
           WHERE offering_id=$1 AND status IN ('waiting','offered') LIMIT 1`,
          [offeringId],
        );
        if (unresolved.rowCount) {
          throw new ConflictException("Resolve the offering waitlist before completion");
        }
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE course_offerings
         SET status=$3,version=version+1,updated_by=$4,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [offeringId, input.expectedVersion, input.status, context.actorId],
      );
      await this.record(client, "delivery.offering.status-changed", "course-offering", offeringId, {
        from: current.status,
        to: input.status,
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      });
      return { id: offeringId, status: input.status, version: updated.rows[0].version };
    });
  }

  async upsertOverlay(institutionId: string, runId: string, input: UpsertRunOverlayDto) {
    const encodedSize = Buffer.byteLength(JSON.stringify(input.overlay), "utf8");
    if (encodedSize > 262144) throw new BadRequestException("Run overlay is too large");
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const run = await client.query(
        `SELECT id,lifecycle FROM course_runs
         WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [runId, institutionId],
      );
      if (!run.rowCount) throw new NotFoundException("Course run was not found");
      if (["completed", "cancelled"].includes(run.rows[0].lifecycle)) {
        throw new ConflictException("Closed course runs cannot change their overlay");
      }
      const existing = await client.query<{ id: string; version: number } & QueryResultRow>(
        `SELECT id,version FROM course_run_overlays
         WHERE course_run_id=$1 AND institution_id=$2 FOR UPDATE`,
        [runId, institutionId],
      );
      if (!existing.rows[0]) {
        if (input.expectedVersion !== 0) {
          throw new ConflictException("Run overlay does not exist yet");
        }
        const id = randomUUID();
        await client.query(
          `INSERT INTO course_run_overlays (
             id,tenant_id,institution_id,course_run_id,overlay,created_by,updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
          [id, context.tenantId, institutionId, runId, input.overlay, context.actorId],
        );
        await this.record(client, "delivery.run-overlay.created", "course-run-overlay", id, {
          courseRunId: runId,
          reason: input.reason.trim(),
          version: 1,
        });
        return { id, version: 1 };
      }
      if (existing.rows[0].version !== input.expectedVersion) {
        throw new ConflictException("Run overlay changed since it was loaded");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE course_run_overlays
         SET overlay=$3,version=version+1,updated_by=$4,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [existing.rows[0].id, input.expectedVersion, input.overlay, context.actorId],
      );
      await this.record(
        client,
        "delivery.run-overlay.updated",
        "course-run-overlay",
        existing.rows[0].id,
        {
          courseRunId: runId,
          reason: input.reason.trim(),
          version: updated.rows[0].version,
        },
      );
      return { id: existing.rows[0].id, version: updated.rows[0].version };
    });
  }

  async createTimetableSlot(
    institutionId: string,
    input: CreateTimetableSlotDto,
  ) {
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException("Timetable slot end must follow its start");
    }
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const run = await client.query(
        `SELECT id,delivery_mode,lifecycle FROM course_runs
         WHERE id=$1 AND institution_id=$2`,
        [input.courseRunId, institutionId],
      );
      if (!run.rowCount) throw new NotFoundException("Course run was not found");
      if (["completed", "cancelled"].includes(run.rows[0].lifecycle)) {
        throw new ConflictException("Closed course runs cannot receive timetable slots");
      }
      if (input.classSectionId) {
        const section = await client.query(
          `SELECT id FROM class_sections
           WHERE id=$1 AND institution_id=$2 AND course_run_id=$3
             AND status IN ('planned','active')`,
          [input.classSectionId, institutionId, input.courseRunId],
        );
        if (!section.rowCount) {
          throw new BadRequestException("Class section does not belong to the course run");
        }
      }
      await client.query(
        `INSERT INTO timetable_slots (
           id,tenant_id,institution_id,course_run_id,class_section_id,
           starts_at,ends_at,timezone,delivery_mode,room_key,location_label,
           online_join_url,recurrence_key,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.courseRunId,
          input.classSectionId ?? null,
          input.startsAt,
          input.endsAt,
          input.timezone,
          input.deliveryMode,
          input.roomKey?.trim() || null,
          input.locationLabel?.trim() || null,
          input.onlineJoinUrl ?? null,
          input.recurrenceKey?.trim() || null,
          context.actorId,
        ],
      );
      await this.record(client, "delivery.timetable-slot.created", "timetable-slot", id, {
        courseRunId: input.courseRunId,
        classSectionId: input.classSectionId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        roomKey: input.roomKey,
        version: 1,
      });
      return { id, status: "scheduled", version: 1 };
    });
  }

  async promoteWaitlist(
    institutionId: string,
    entryId: string,
    input: PromoteWaitlistEntryDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const entry = await client.query<{
        id: string;
        offering_id: string;
        learner_person_id: string;
        status: string;
        version: number;
        course_run_id: string;
      } & QueryResultRow>(
        `SELECT entry.id,entry.offering_id,entry.learner_person_id,entry.status,entry.version,
                offering.course_run_id
         FROM waitlist_entries entry
         JOIN course_offerings offering
           ON offering.tenant_id=entry.tenant_id AND offering.id=entry.offering_id
         WHERE entry.id=$1 AND entry.institution_id=$2 FOR UPDATE`,
        [entryId, institutionId],
      );
      const current = entry.rows[0];
      if (!current) throw new NotFoundException("Waitlist entry was not found");
      if (current.version !== input.expectedVersion) {
        throw new ConflictException("Waitlist entry changed since it was loaded");
      }
      if (!["waiting", "offered"].includes(current.status)) {
        throw new ConflictException("Waitlist entry is not eligible for promotion");
      }
      const existing = await client.query<EnrolmentRow>(
        `SELECT id,institution_id,learner_person_id,course_run_id,status,version
         FROM enrolments
         WHERE learner_person_id=$1 AND course_run_id=$2
           AND effective_until IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [current.learner_person_id, current.course_run_id],
      );
      let enrolmentId = existing.rows[0]?.id;
      let enrolmentVersion = existing.rows[0]?.version;
      if (existing.rows[0]) {
        const updated = await client.query<{ version: number } & QueryResultRow>(
          `UPDATE enrolments
           SET status='active',class_section_id=$3,cohort_id=$4,
               version=version+1,updated_by=$5,updated_at=now()
           WHERE id=$1 AND version=$2 RETURNING version`,
          [
            existing.rows[0].id,
            existing.rows[0].version,
            input.classSectionId ?? null,
            input.cohortId ?? null,
            context.actorId,
          ],
        );
        enrolmentVersion = updated.rows[0].version;
      } else {
        enrolmentId = randomUUID();
        await client.query(
          `INSERT INTO enrolments (
             id,tenant_id,institution_id,learner_person_id,course_run_id,offering_id,
             class_section_id,cohort_id,status,enrolled_on,source,created_by,updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',current_date,'manual',$9,$9)`,
          [
            enrolmentId,
            context.tenantId,
            institutionId,
            current.learner_person_id,
            current.course_run_id,
            current.offering_id,
            input.classSectionId ?? null,
            input.cohortId ?? null,
            context.actorId,
          ],
        );
        enrolmentVersion = 1;
      }
      const updatedEntry = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE waitlist_entries
         SET status='promoted',promoted_enrolment_id=$3,version=version+1,
             updated_by=$4,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [entryId, input.expectedVersion, enrolmentId, context.actorId],
      );
      await this.record(client, "delivery.waitlist.promoted", "waitlist-entry", entryId, {
        offeringId: current.offering_id,
        learnerPersonId: current.learner_person_id,
        enrolmentId,
        enrolmentVersion,
        reason: input.reason.trim(),
        version: updatedEntry.rows[0].version,
      });
      return {
        id: entryId,
        status: "promoted",
        enrolmentId,
        enrolmentVersion,
        version: updatedEntry.rows[0].version,
      };
    });
  }

  async reinstateEnrolment(
    institutionId: string,
    enrolmentId: string,
    input: ReinstateEnrolmentDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<EnrolmentRow>(
        `SELECT id,institution_id,learner_person_id,course_run_id,status,version
         FROM enrolments WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [enrolmentId, institutionId],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Enrolment was not found");
      if (current.version !== input.expectedVersion) {
        throw new ConflictException("Enrolment changed since it was loaded");
      }
      if (!["withdrawn", "cancelled"].includes(current.status)) {
        throw new ConflictException("Only withdrawn or cancelled enrolments can be reinstated");
      }
      const duplicate = await client.query(
        `SELECT 1 FROM enrolments
         WHERE learner_person_id=$1 AND course_run_id=$2
           AND effective_until IS NULL AND status NOT IN ('withdrawn','cancelled')
         LIMIT 1`,
        [current.learner_person_id, current.course_run_id],
      );
      if (duplicate.rowCount) {
        throw new ConflictException("Learner already has a current enrolment in this course run");
      }
      const newId = randomUUID();
      await client.query(
        `INSERT INTO enrolments (
           id,tenant_id,institution_id,learner_person_id,course_run_id,offering_id,
           class_section_id,cohort_id,status,enrolled_on,source,
           reinstated_from_enrolment_id,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',current_date,'transfer',$9,$10,$10)`,
        [
          newId,
          context.tenantId,
          institutionId,
          current.learner_person_id,
          current.course_run_id,
          input.offeringId ?? null,
          input.classSectionId ?? null,
          input.cohortId ?? null,
          enrolmentId,
          context.actorId,
        ],
      );
      await client.query(
        `INSERT INTO enrolment_transitions (
           id,tenant_id,institution_id,enrolment_id,from_status,to_status,reason,actor_id,correlation_id
         ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8)`,
        [
          randomUUID(),
          context.tenantId,
          institutionId,
          newId,
          current.status,
          input.reason.trim(),
          context.actorId,
          context.correlationId,
        ],
      );
      await this.record(client, "enrolment.reinstated", "enrolment", newId, {
        reinstatedFromEnrolmentId: enrolmentId,
        learnerPersonId: current.learner_person_id,
        courseRunId: current.course_run_id,
        reason: input.reason.trim(),
        version: 1,
      });
      return { id: newId, status: "active", reinstatedFromEnrolmentId: enrolmentId, version: 1 };
    });
  }

  async enrolmentHistory(institutionId: string, enrolmentId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const enrolment = await client.query(
        `SELECT id FROM enrolments WHERE id=$1 AND institution_id=$2`,
        [enrolmentId, institutionId],
      );
      if (!enrolment.rowCount) throw new NotFoundException("Enrolment was not found");
      const [periods, transitions] = await Promise.all([
        client.query(
          `SELECT id,enrolment_id "enrolmentId",status,
                  effective_from "effectiveFrom",effective_until "effectiveUntil",
                  reason,actor_id "actorId",correlation_id "correlationId"
           FROM enrolment_membership_periods
           WHERE enrolment_id=$1 ORDER BY effective_from,id`,
          [enrolmentId],
        ),
        client.query(
          `SELECT id,from_status "fromStatus",to_status "toStatus",reason,
                  occurred_at "occurredAt",actor_id "actorId",correlation_id "correlationId"
           FROM enrolment_transitions
           WHERE enrolment_id=$1 ORDER BY occurred_at,id`,
          [enrolmentId],
        ),
      ]);
      return { enrolmentId, membershipPeriods: periods.rows, transitions: transitions.rows };
    });
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const result = await client.query(
      `SELECT id FROM institutions WHERE id=$1 AND status='active'`,
      [institutionId],
    );
    if (!result.rowCount) throw new NotFoundException("Active institution was not found");
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
