import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("access administration is reachable only to institutional administrators", async () => {
  const [page, nav] = await Promise.all([
    source("../app/admin/access/page.tsx"),
    source("../src/features/admin/admin-section-navigation.tsx"),
  ]);
  assert.match(page, /tenant-owner/);
  assert.match(page, /institution-admin/);
  assert.match(page, /redirect\("\/"\)/);
  assert.match(nav, /\/admin\/access/);
});

test("access BFF derives membership context and allowlists every lifecycle operation", async () => {
  const [route, client] = await Promise.all([
    source("../app/api/access/[operation]/route.ts"),
    source("../src/server/access-directory-api.ts"),
  ]);
  assert.match(route, /isSameOriginRequest/);
  for (const operation of ["invite", "membership-status", "role-assign", "role-end", "invitation-revoke", "invitation-resend", "invitations-bulk-revoke"]) assert.match(route, new RegExp(operation));
  assert.match(client, /x-veza-membership-id/);
  assert.doesNotMatch(client, /x-veza-tenant-id/);
});

test("access workspace completes membership, role and invitation journeys", async () => {
  const [workspace, styles] = await Promise.all([
    source("../src/features/admin/access-administration-workspace.tsx"),
    source("../styles/access-administration.css"),
  ]);
  for (const operation of ["invite", "membership-status", "role-assign", "role-end", "invitation-revoke", "invitation-resend", "invitations-bulk-revoke"]) assert.match(workspace, new RegExp(operation));
  assert.match(workspace, /BulkSelectionToolbar/);
  assert.match(workspace, /minLength=\{20\}/);
  assert.match(workspace, /tenantOwner/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) minmax\(20rem, 25rem\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});
