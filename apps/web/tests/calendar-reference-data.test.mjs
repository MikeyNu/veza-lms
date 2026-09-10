import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("calendar keeps the approved weekly reference while using authoritative reads", async () => {
  const page = await source("../app/calendar/page.tsx");

  assert.match(page, /loadInstitutionTimetable/);
  assert.match(page, /loadLearnerCalendar/);
  assert.match(page, /calendar-grid/);
  assert.match(page, /calendar-layout/);
  assert.match(page, /calendar-context/);
  assert.match(page, /calendar-utilities/);
  assert.doesNotMatch(page, /calendar-agenda/);
  assert.doesNotMatch(page, /Dr\. Priya|attendanceRows|Room Conflict|Faculty Unavailable/);
  assert.doesNotMatch(page, /\u2014/);
});

test("calendar preserves intended route roles without inventing unsupported data", async () => {
  const [page, accessPolicy] = await Promise.all([
    source("../app/calendar/page.tsx"),
    source("../src/features/workspace/access-policy.ts"),
  ]);

  assert.match(accessPolicy, /const calendarRoles: readonly BaselineRoleKey\[] = \[\.\.\.institutionalHomeRoles, "assessor", "moderator", "learner", "guardian-sponsor"\]/);
  assert.match(page, /role === "learner"/);
  assert.match(page, /institutionalHomeRoles\.includes\(role\)/);
  assert.match(page, /does not yet have an authorised timetable read path/);
  assert.match(page, /No synthetic schedule has been substituted/);
});
