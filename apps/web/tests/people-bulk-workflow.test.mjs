import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("people directory exposes only eligible lifecycle records to bulk selection", async () => {
  const workspace = await source("../src/features/people/people-workspace.tsx");
  assert.match(workspace, /person\.status === "active" \|\| person\.status === "inactive"/);
  assert.match(workspace, /disabled=\{!eligibleForBulk\}/);
  assert.match(workspace, /expectedVersion: person\.version/);
  assert.match(workspace, /Select all eligible visible people/);
  assert.doesNotMatch(workspace, /institutionalIdentifiers\[0\] \?\? "—"/);
});

test("bulk people BFF is same-origin and never forwards tenant identity", async () => {
  const [route, client] = await Promise.all([
    source("../app/api/people/bulk-status/route.ts"),
    source("../src/server/people-bulk-api.ts"),
  ]);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /64 \* 1024/);
  assert.match(client, /\/v1\/people\/bulk-status/);
  assert.match(client, /authorization: `Bearer \$\{session\.accessToken\}`/);
  assert.doesNotMatch(client, /x-veza-tenant-id/);
  assert.match(client, /isReceipt/);
});

test("bulk confirmation is explicit, reasoned and responsive", async () => {
  const [actions, toolbar, styles] = await Promise.all([
    source("../src/features/people/people-bulk-actions.tsx"),
    source("../src/components/data/bulk-selection-toolbar.tsx"),
    source("../styles/bulk-actions.css"),
  ]);
  assert.match(actions, /minLength=\{20\}/);
  assert.match(actions, /This command is atomic/);
  assert.match(actions, /Deceased and merged records are never eligible/);
  assert.match(actions, /resetPanel\(\)/);
  assert.match(toolbar, /aria-live="polite"/);
  assert.match(styles, /position: sticky/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});
