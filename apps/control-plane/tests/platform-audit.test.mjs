import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("platform audit is operator guarded, bounded and read only", async () => {
  const [page, api, view, shell] = await Promise.all([
    source("../app/audit/page.tsx"),
    source("../src/server/platform-audit-api.ts"),
    source("../src/features/audit/platform-audit.tsx"),
    source("../src/components/control-plane-shell.tsx"),
  ]);
  assert.match(page, /requireOperatorSession/);
  assert.match(api, /maximumResponseBytes/);
  assert.match(api, /control-plane\/audit-events/);
  assert.match(view, /method="get"/);
  assert.doesNotMatch(view, /method="post"/);
  assert.match(view, /Separate evidence plane/);
  assert.match(shell, /href: "\/audit"[\s\S]*available: true/);
});

test("platform audit UI is responsive and does not expose tenant content", async () => {
  const [view, css, globals] = await Promise.all([
    source("../src/features/audit/platform-audit.tsx"),
    source("../styles/platform-audit.css"),
    source("../app/globals.css"),
  ]);
  assert.match(view, /Inspect operational metadata/);
  assert.doesNotMatch(view, /submission|lessonContent|assessmentAttempt/);
  assert.match(css, /grid-template-columns:minmax\(260px,.72fr\) minmax\(0,2.28fr\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(globals, /platform-audit\.css/);
});
