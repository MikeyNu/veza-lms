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
const timetableStatuses = ["scheduled", "cancelled", "completed"] as const;

function requireUuid(value: string, label: string): void {
  if (!uuid.test(value)) throw new Error(`${label} identifier is invalid`);
}

function parseTimetableSlot(value: unknown, label: string, institutionId: string): TimetableSlotRecord {
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
    ...(classSectionId ? { classSectionId } : {}),
    startsAt: requireString(item.startsAt, `${label}.startsAt`),
    endsAt: requireString(item.endsAt, `${label}.endsAt`),
    timezone: requireString(item.timezone, `${label}.timezone`),
    deliveryMode: requireOneOf(item.deliveryMode, deliveryModes, `${label}.deliveryMode`),
    ...(roomKey ? { roomKey } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(onlineJoinUrl ? { onlineJoinUrl } : {}),
    ...(recurrenceKey ? { recurrenceKey } : {}),
    status: requireOneOf(item.status, timetableStatuses, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

export async function loadInstitutionTimetable(institutionId: string): Promise<readonly TimetableSlotRecord[]> {
  requireUuid(institutionId, "Institution");
  const response = await requestWorkspaceJson(`/v1/institutions/${institutionId}/delivery`, {
    service: "Delivery service",
    maximumBytes,
    timeoutMs: 15_000,
  });
  const record = requireRecord(response, "Delivery workspace");
  const returnedInstitutionId = requireString(record.institutionId, "Delivery workspace.institutionId");
  if (returnedInstitutionId !== institutionId) {
    throw new Error("Delivery workspace crossed the requested institution boundary");
  }
  return requireRecordArray(record.timetable, "Delivery workspace.timetable")
    .map((slot, index) => parseTimetableSlot(slot, `Delivery workspace.timetable[${index}]`, institutionId));
}
