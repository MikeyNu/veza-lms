import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testsDirectory, "..");
const repoRoot = path.resolve(webRoot, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("workspace navigation exposes help once through the shell utility affordance", () => {
  const navigation = read("apps/web/src/features/workspace/navigation.ts");
  const shell = read("apps/web/src/components/app-shell-client.tsx");

  assert.doesNotMatch(navigation, /\{ key: "help"[^\n]+href: "\/help"/);
  assert.match(shell, /className="support-link"/);
  assert.match(shell, /href="\/help"/);
});

test("calendar is role-aware, privacy-safe and does not present inert controls", () => {
  const calendar = read("apps/web/app/calendar/page.tsx");

  assert.match(calendar, /primaryRole\(resolution\.session\)/);
  assert.match(calendar, /role === "guardian-sponsor"/);
  assert.match(calendar, /Privacy boundary preserved/);
  assert.match(calendar, /scheduleManagers\.includes\(role\)/);
  assert.match(calendar, /resolution\.session\.tenant\.timezone/);
  assert.doesNotMatch(calendar, /GMT \+5:30/);
  assert.doesNotMatch(calendar, />Filter</);
  assert.doesNotMatch(calendar, />Class Actions</);
  assert.doesNotMatch(calendar, />Mark all</);
  assert.doesNotMatch(calendar, />QR Code</);
});

test("analytics presents one real metric selection model and one evidence view", () => {
  const analytics = read("apps/web/src/features/analytics/analytics-reference-workspace.tsx");

  assert.match(analytics, /aria-pressed=/);
  assert.match(analytics, /vz-analytics-metric-strip/);
  assert.match(analytics, /What this number means/);
  assert.match(analytics, /axisLabels/);
  assert.doesNotMatch(analytics, /vz-analytics-signal-panel/);
  assert.doesNotMatch(analytics, /vz-analytics-comparison/);
  assert.doesNotMatch(analytics, />Filters</);
  assert.doesNotMatch(analytics, />Export</);
});

test("learner home keeps one visually dominant next action and concrete timing context", () => {
  const learner = read("apps/web/src/features/learner/learner-today-workspace.tsx");
  const styles = read("apps/web/src/features/learner/learner-today-workspace.module.css");

  assert.match(learner, /focusPrompt/);
  assert.match(learner, /focusDate/);
  assert.match(learner, /className=\{styles\.focusMeta\}/);
  assert.match(styles, /\.priority[\s\S]*linear-gradient/);
  assert.match(styles, /\.priorityGrid[\s\S]*grid-template-columns/);
  assert.match(styles, /@media \(max-width: 1040px\)[\s\S]*\.priorityGrid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});

test("UX integrity sources contain no prohibited em dash characters", () => {
  const audited = [
    "apps/web/src/features/workspace/navigation.ts",
    "apps/web/src/features/learner/learner-today-workspace.tsx",
    "apps/web/src/features/learner/learner-today-workspace.module.css",
    "apps/web/app/calendar/page.tsx",
    "apps/web/styles/calendar-reference.css",
    "apps/web/src/features/analytics/analytics-reference-workspace.tsx",
    "apps/web/styles/analytics-reference.css",
  ];

  for (const file of audited) {
    assert.doesNotMatch(read(file), /\u2014/u, `${file} contains a prohibited em dash`);
  }
});
