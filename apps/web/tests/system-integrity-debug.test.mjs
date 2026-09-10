import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dedicated tenant-owner invitation route agrees with the central route policy", async () => {
  const [policy, page] = await Promise.all([
    source("../src/features/workspace/access-policy.ts"),
    source("../app/people/invitations/new/page.tsx"),
  ]);

  assert.match(
    policy,
    /id: "people-invitations"[^\n]+roles: \["tenant-owner"\]/,
  );
  assert.match(page, /roles\.includes\("tenant-owner"\)/);
});

test("help stays available as a utility without occupying duplicate primary navigation", async () => {
  const [navigation, shell] = await Promise.all([
    source("../src/features/workspace/navigation.ts"),
    source("../src/components/app-shell-client.tsx"),
  ]);

  assert.doesNotMatch(navigation, /\{ key: "help"[^\n]+href: "\/help"/);
  assert.match(shell, /className="support-link"/);
  assert.match(shell, /href="\/help"/);
  assert.match(shell, /label: "Help and support"/);
});

test("calendar is connected to bounded authoritative reads and contains no synthetic operational data", async () => {
  const [page, policy, staffRead, learnerRead, styles] = await Promise.all([
    source("../app/calendar/page.tsx"),
    source("../src/features/workspace/access-policy.ts"),
    source("../src/server/delivery-api.ts"),
    source("../src/server/learner-calendar-api.ts"),
    source("../styles/calendar-reference.css"),
  ]);

  assert.match(page, /loadInstitutionTimetable/);
  assert.match(page, /loadLearnerCalendar/);
  assert.match(page, /No synthetic schedule has been substituted/);
  assert.match(page, /institutionalHomeRoles\.includes\(role\)/);
  assert.doesNotMatch(page, /demoEvents/);
  assert.doesNotMatch(page, /May 5/);
  assert.doesNotMatch(page, /GMT \+5:30/);
  assert.doesNotMatch(page, /Mark all|QR Code|Create Live Class|Class Actions/);
  assert.match(staffRead, /delivery\/timetable\?\$\{params\}/);
  assert.match(learnerRead, /\/v1\/learner\/calendar\?\$\{params\}/);
  assert.match(policy, /export const calendarRoles[\s\S]*\.\.\.institutionalHomeRoles,[\s\S]*"learner",[\s\S]*\] as const;/);
  assert.doesNotMatch(policy.match(/export const calendarRoles[\s\S]*?\] as const;/)?.[0] ?? "", /guardian-sponsor|assessor|moderator/);
  assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});

test("system integrity debug sources contain no prohibited em dash characters", async () => {
  const paths = [
    "../src/features/workspace/access-policy.ts",
    "../src/features/workspace/navigation.ts",
    "../app/calendar/page.tsx",
    "../src/server/delivery-api.ts",
    "../src/server/learner-calendar-api.ts",
    "../styles/calendar-reference.css",
    "../../api/scripts/migrate.mjs",
    "../../api/src/modules/learner-course/application/learner-calendar.service.ts",
    "../../api/src/modules/learner-course/http/learner-calendar.controller.ts",
    "../../api/src/modules/catalogue/application/delivery-timetable-query.service.ts",
    "../../api/src/modules/catalogue/http/delivery-timetable-query.controller.ts",
    "../../../scripts/qa/migration-validation.mjs",
  ];

  for (const path of paths) {
    assert.doesNotMatch(await source(path), /\u2014/u, `${path} contains a prohibited em dash`);
  }
});
