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

test("access BFF derives membership context, validates responses and preserves safe errors", async () => {
  const [route, client, transport] = await Promise.all([
    source("../app/api/access/[operation]/route.ts"),
    source("../src/server/access-directory-api.ts"),
    source("../src/server/workspace-json-request.ts"),
  ]);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /safeStatus/);
  for (const operation of ["invite", "membership-status", "role-assign", "role-end", "invitation-revoke", "invitation-resend", "invitations-bulk-revoke"]) {
    assert.match(route, new RegExp(operation));
  }
  assert.match(client, /requestWorkspaceJson/);
  assert.match(transport, /x-veza-membership-id/);
  assert.doesNotMatch(transport, /x-veza-tenant-id/);
  assert.match(client, /function directory/);
  assert.match(client, /function membership/);
  assert.match(client, /function invitation/);
  assert.match(client, /function role/);
  assert.doesNotMatch(client, /return body as T/);
});

test("access workspace completes membership, role and invitation journeys accessibly", async () => {
  const [workspace, styles] = await Promise.all([
    source("../src/features/admin/access-administration-workspace.tsx"),
    source("../styles/access-administration.css"),
  ]);
  for (const operation of ["invite", "membership-status", "role-assign", "role-end", "invitation-revoke", "invitation-resend", "invitations-bulk-revoke"]) {
    assert.match(workspace, new RegExp(operation));
  }
  assert.match(workspace, /BulkSelectionToolbar/);
  assert.match(workspace, /name="scope"/);
  assert.match(workspace, /selectedScope/);
  assert.doesNotMatch(workspace, /name="scopeType"/);
  assert.doesNotMatch(workspace, /name="scopeId"/);
  assert.match(workspace, /const formElement = event\.currentTarget/);
  assert.match(workspace, /className="access-member-select"/);
  assert.match(workspace, /aria-pressed/);
  assert.doesNotMatch(workspace, /<tr[^>]+onClick=/);
  assert.match(styles, /\.access-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(20rem, 25rem\)/s);
  assert.match(styles, /\.access-member-select:focus-visible/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test("new invitations use a transient shared-system workflow instead of permanent page real estate", async () => {
  const [workspace, styles] = await Promise.all([
    source("../src/features/admin/access-administration-workspace.tsx"),
    source("../styles/access-administration.css"),
  ]);

  assert.match(workspace, /Drawer/);
  assert.match(workspace, /inviteOpen/);
  assert.match(workspace, /Invite access/);
  assert.match(workspace, /ValidationSummary/);
  assert.match(workspace, /<Field/);
  assert.match(workspace, /<TextInput/);
  assert.match(workspace, /<Select/);
  assert.match(workspace, /loading=\{state === "saving"\}/);
  assert.doesNotMatch(workspace, /className="access-invite-panel"/);
  assert.match(styles, /\.access-invitation-grid \{ margin-top: 1rem; \}/);
  assert.match(styles, /\.access-invite-form/);
});

test("invitation choices are constrained by acting role and selected scope before submission", async () => {
  const workspace = await source("../src/features/admin/access-administration-workspace.tsx");
  assert.match(workspace, /tenantInviteRoles/);
  assert.match(workspace, /tenantOwnerInstitutionInviteRoles/);
  assert.match(workspace, /institutionAdminInviteRoles/);
  assert.match(workspace, /inviteRolesFor/);
  assert.match(workspace, /changeScope/);
  assert.match(workspace, /guardian-sponsor/);
  assert.match(workspace, /learner/);
  assert.match(workspace, /Choose a specific institution for least-privilege access/);
  assert.match(workspace, /The API still rechecks authorization/);
});
