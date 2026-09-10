import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

const maximumRangeMs = 31 * 24 * 60 * 60 * 1000;
const maximumSlots = 2000;

function boundedRange(from: string | undefined, to: string | undefined) {
  if (!from || !to) throw new BadRequestException("Timetable range requires from and to timestamps");
  const start = new Date(from);
  const end = new Date(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new BadRequestException("Timetable range contains an invalid timestamp");
  }
  if (end <= start) throw new BadRequestException("Timetable range end must follow its start");
  if (end.getTime() - start.getTime() > maximumRangeMs) {
    throw new BadRequestException("Timetable range cannot exceed 31 days");
  }
  return { start, end };
}

@Injectable()
export class DeliveryTimetableQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async timetable(institutionId: string, from: string | undefined, to: string | undefined) {
    const range = boundedRange(from, to);
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query("SELECT id FROM institutions WHERE id=$1", [institutionId]);
      if (!institution.rowCount) throw new NotFoundException("Institution was not found");

      const result = await client.query(
        `SELECT slot.id,slot.institution_id "institutionId",
                slot.course_run_id "courseRunId",run.title "courseTitle",
                slot.class_section_id "classSectionId",
                COALESCE(section.title,run.title) title,
                slot.starts_at "startsAt",slot.ends_at "endsAt",
                slot.timezone,slot.delivery_mode "deliveryMode",
                slot.room_key "roomKey",slot.location_label "locationLabel",
                slot.online_join_url "onlineJoinUrl",slot.recurrence_key "recurrenceKey",
                slot.status,slot.version
         FROM timetable_slots slot
         JOIN course_runs run
           ON run.tenant_id=slot.tenant_id AND run.id=slot.course_run_id
         LEFT JOIN class_sections section
           ON section.tenant_id=slot.tenant_id AND section.id=slot.class_section_id
         WHERE slot.institution_id=$1
           AND slot.status='scheduled'
           AND run.lifecycle IN ('scheduled','open','in_progress')
           AND slot.starts_at < $3 AND slot.ends_at > $2
         ORDER BY slot.starts_at,slot.id
         LIMIT $4`,
        [institutionId, range.start.toISOString(), range.end.toISOString(), maximumSlots + 1],
      );
      if (result.rows.length > maximumSlots) {
        throw new BadRequestException("Timetable range contains too many sessions; request a shorter window");
      }
      return {
        institutionId,
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        slots: result.rows,
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
