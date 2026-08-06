import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("evidence room loads only through the verified membership boundary", async () => {
  const [page, api] = await Promise.all([
    source("../app/evidence/page.tsx"),
    source("../src/server/audit-api.ts"),
  ]);
  assert.match(page, /requireWorkspaceSession/);
  assert.match(page, /tenant-owner/);
  assert.match(page, /institution-admin/);
  assert.match(page, /auditor/);
  assert.match(api, /getWebOidcSession/);
  assert.match(api, /membershipCookieName/);
  assert.match(api, /x-veza-membership-id/);
  assert.doesNotMatch(api, /x-veza-tenant-id/);
  assert.match(api, /maximumResponseBytes/);
});

test("evidence room is read-only, filterable, responsive and landmark-safe", async () => {
  const [room, css, globals] = await Promise.all([
    source("../src/features/evidence/evidence-room.tsx"),
    source("../styles/evidence-room.css"),
    source("../app/globals.css"),
  ]);
  assert.match(room, /method="get"/);
  assert.match(room, /Inspect recorded evidence/);
  assert.match(room, /before/);
  assert.match(room, /after/);
  assert.doesNotMatch(room, /method="post"/);
  assert.doesNotMatch(room, /<main\b/);
  assert.match(room, /<section className="evidence-stream"/);
  assert.match(css, /grid-template-columns:minmax\(260px,.72fr\) minmax\(0,2.28fr\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(globals, /evidence-room\.css/);
});
