import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

interface LearnerContextRow extends QueryResultRow {
  person_id: string;
}

const maximumRangeMs = 31 * 24 * 60 * 60 * 1000;
const maximumSlots = 500;

function boundedRange(from: string | undefined, to: string | undefined) {
  if (!from || !to) throw new BadRequestException("Calendar range requires from and to timestamps");
  const start = new Date(from);
  const end = new Date(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new BadRequestException("Calendar range contains an invalid timestamp");
  }
  if (end <= start) throw new BadRequestException("Calendar range end must follow its start");
  if (end.getTime() - start.getTime() > maximumRangeMs) {
    throw new BadRequestException("Calendar range cannot exceed 31 days");
  }
  return { start, end };
}

@Injectable()
export class LearnerCalendarService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async calendar(from: string | undefined, to: string | undefined) {
    const range = boundedRange(from, to);
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const learner = await client.query<LearnerContextRow>(
        `SELECT person.id person_id
         FROM people person
         JOIN learner_profiles profile
           ON profile.tenant_id=person.tenant_id AND profile.person_id=person.id
         WHERE person.linked_user_id=$1 AND person.status='active'
           AND profile.status IN ('prospective','active','completed')
         ORDER BY CASE profile.status WHEN 'active' THEN 0 ELSE 1 END,profile.created_at DESC
         LIMIT 1`,
        [context.actorId],
      );
      const learnerPersonId = learner.rows[0]?.person_id;
      if (!learnerPersonId) {
        throw new ForbiddenException("Authenticated identity is not linked to an active learner profile");
      }

      const result = await client.query(
        `SELECT slot.id,slot.institution_id "institutionId",
                slot.course_run_id "courseRunId",run.title "courseTitle",
                slot.class_section_id "classSectionId",
                COALESCE(section.title,run.title) title,
                slot.starts_at "startsAt",slot.ends_at "endsAt",
                slot.timezone,slot.delivery_mode "deliveryMode",
                slot.room_key "roomKey",slot.location_label "locationLabel",
                slot.online_join_url "onlineJoinUrl",slot.status,slot.version
         FROM timetable_slots slot
         JOIN course_runs run
           ON run.tenant_id=slot.tenant_id AND run.id=slot.course_run_id
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
           AND run.lifecycle IN ('scheduled','open','in_progress')
           AND slot.starts_at < $3 AND slot.ends_at > $2
         ORDER BY slot.starts_at,slot.id
         LIMIT $4`,
        [learnerPersonId, range.start.toISOString(), range.end.toISOString(), maximumSlots + 1],
      );
      if (result.rows.length > maximumSlots) {
        throw new BadRequestException("Calendar range contains too many sessions; request a shorter window");
      }
      return {
        learnerPersonId,
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        slots: result.rows,
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
