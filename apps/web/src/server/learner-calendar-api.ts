import type { LearnerCalendar, LearnerCalendarSlot } from "@veza/contracts";
import {
  optionalString,
  requireInteger,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
} from "./json-contract";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 1024 * 1024;
const deliveryModes = ["in_person", "online", "blended", "workplace"] as const;

function parseSlot(value: unknown, label: string): LearnerCalendarSlot {
  const item = requireRecord(value, label);
  const classSectionId = optionalString(item.classSectionId, `${label}.classSectionId`);
  const roomKey = optionalString(item.roomKey, `${label}.roomKey`);
  const locationLabel = optionalString(item.locationLabel, `${label}.locationLabel`);
  const onlineJoinUrl = optionalString(item.onlineJoinUrl, `${label}.onlineJoinUrl`);
  return {
    id: requireString(item.id, `${label}.id`),
    institutionId: requireString(item.institutionId, `${label}.institutionId`),
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
    status: requireOneOf(item.status, ["scheduled"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

export async function loadLearnerCalendar(from: string, to: string): Promise<LearnerCalendar> {
  const params = new URLSearchParams({ from, to });
  const response = await requestWorkspaceJson(`/v1/learner/calendar?${params}`, {
    service: "Learner calendar service",
    maximumBytes,
    timeoutMs: 15_000,
  });
  const record = requireRecord(response, "Learner calendar");
  return {
    learnerPersonId: requireString(record.learnerPersonId, "Learner calendar.learnerPersonId"),
    from: requireString(record.from, "Learner calendar.from"),
    to: requireString(record.to, "Learner calendar.to"),
    slots: requireRecordArray(record.slots, "Learner calendar.slots").map((slot, index) =>
      parseSlot(slot, `Learner calendar.slots[${index}]`),
    ),
    generatedAt: requireString(record.generatedAt, "Learner calendar.generatedAt"),
  };
}
