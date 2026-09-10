import type { TimetableSlotRecord } from "@veza/contracts";
import {
  optionalString,
  requireInteger,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
} from "./json-contract";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deliveryModes = ["in_person", "online", "blended", "workplace"] as const;

export interface InstitutionCalendarSlot extends TimetableSlotRecord {
  readonly courseTitle: string;
  readonly title: string;
}

export interface InstitutionTimetable {
  readonly institutionId: string;
  readonly from: string;
  readonly to: string;
  readonly slots: readonly InstitutionCalendarSlot[];
  readonly generatedAt: string;
}

function requireUuid(value: string, label: string): void {
  if (!uuid.test(value)) throw new Error(`${label} identifier is invalid`);
}

function parseTimetableSlot(value: unknown, label: string, institutionId: string): InstitutionCalendarSlot {
  const item = requireRecord(value, label);
  const returnedInstitutionId = requireString(item.institutionId, `${label}.institutionId`);
  if (returnedInstitutionId !== institutionId) {
    throw new Error(`${label} crossed the requested institution boundary`);
  }
  const classSectionId = optionalString(item.classSectionId, `${label}.classSectionId`);
  const roomKey = optionalString(item.roomKey, `${label}.roomKey`);
  const locationLabel = optionalString(item.locationLabel, `${label}.locationLabel`);
  const onlineJoinUrl = optionalString(item.onlineJoinUrl, `${label}.onlineJoinUrl`);
  const recurrenceKey = optionalString(item.recurrenceKey, `${label}.recurrenceKey`);
  return {
    id: requireString(item.id, `${label}.id`),
    institutionId: returnedInstitutionId,
    courseRunId: requireString(item.courseRunId, `${label}.courseRunId`),
    courseTitle: requireString(item.courseTitle, `${label}.courseTitle`),
    ...(classSectionId ? { classSectionId } : {}),
    title: requireString(item.title, `${label}.title`),
    startsAt: requireString(item.startsAt, `${label}.startsAt`),
    endsAt: requireString(item.endsAt, `${label}.endsAt`),
    timezone: requireString(item.timezone, `${label}.timezone`),
    deliveryMode: requireOneOf(item.deliveryMode, deliveryModes, `${label}.deliveryMode`),
    ...(roomKey ? { roomKey } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(onlineJoinUrl ? { onlineJoinUrl } : {}),
    ...(recurrenceKey ? { recurrenceKey } : {}),
    status: requireOneOf(item.status, ["scheduled"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

export async function loadInstitutionTimetable(
  institutionId: string,
  from: string,
  to: string,
): Promise<InstitutionTimetable> {
  requireUuid(institutionId, "Institution");
  const params = new URLSearchParams({ from, to });
  const response = await requestWorkspaceJson(
    `/v1/institutions/${institutionId}/delivery/timetable?${params}`,
    {
      service: "Delivery timetable service",
      maximumBytes,
      timeoutMs: 15_000,
    },
  );
  const record = requireRecord(response, "Institution timetable");
  const returnedInstitutionId = requireString(record.institutionId, "Institution timetable.institutionId");
  if (returnedInstitutionId !== institutionId) {
    throw new Error("Institution timetable crossed the requested institution boundary");
  }
  return {
    institutionId: returnedInstitutionId,
    from: requireString(record.from, "Institution timetable.from"),
    to: requireString(record.to, "Institution timetable.to"),
    slots: requireRecordArray(record.slots, "Institution timetable.slots").map((slot, index) =>
      parseTimetableSlot(slot, `Institution timetable.slots[${index}]`, institutionId),
    ),
    generatedAt: requireString(record.generatedAt, "Institution timetable.generatedAt"),
  };
}
