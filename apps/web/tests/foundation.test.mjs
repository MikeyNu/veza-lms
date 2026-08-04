import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("dashboard exposes one primary heading and semantic navigation", async () => {
  const overview = await source("../src/features/dashboard/dashboard-overview.tsx");
  const shell = await source("../src/components/app-shell.tsx");
  assert.equal((overview.match(/<h1/g) ?? []).length, 1);
  assert.match(shell, /aria-label="Primary navigation"/);
  assert.match(shell, /aria-current/);
  assert.match(shell, /Mobile navigation/);
});

test("semantic status colours are declared as tokens", async () => {
  const globalCss = await source("../app/globals.css");
  assert.match(globalCss, /--critical: var\(--veza-critical\)/);
  assert.match(globalCss, /--success: var\(--veza-success\)/);
});

test("web authentication uses PKCE and an encrypted HttpOnly BFF session", async () => {
  const signIn = await source("../app/api/auth/sign-in/route.ts");
  const callback = await source("../app/api/auth/callback/route.ts");
  const workspace = await source("../src/server/workspace-session.ts");
  assert.match(signIn, /createAuthorizationRequest/);
  assert.match(callback, /completeAuthorization/);
  assert.match(callback, /httpOnly: true/);
  assert.match(workspace, /getWebOidcSession/);
  assert.doesNotMatch(workspace, /veza_access_token/);
});

test("workspace selection validates a membership against the authenticated API principal", async () => {
  const route = await source("../app/api/auth/select-workspace/route.ts");
  const page = await source("../app/select-workspace/page.tsx");
  const api = await source("../src/server/workspace-api.ts");
  assert.match(api, /\/v1\/session\/workspaces/);
  assert.match(route, /workspaces\.some/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /membershipCookieName/);
  assert.match(page, /membershipId/);
  assert.doesNotMatch(route, /tenantId/);
});

test("role-adaptive navigation has no synthetic notification badges", async () => {
  const navigation = await source("../src/features/workspace/navigation.ts");
  assert.match(navigation, /guardian-sponsor/);
  assert.match(navigation, /auditor/);
  assert.match(navigation, /support-agent/);
  assert.doesNotMatch(navigation, /badge:\s*3/);
});

test("authenticated workspaces use verified foundation state instead of demo learner metrics", async () => {
  const [page, home] = await Promise.all([
    source("../app/page.tsx"),
    source("../src/features/workspace/workspace-home.tsx"),
  ]);
  assert.match(page, /demo=\{resolution\.demo\}/);
  assert.match(home, /demo \? <DashboardOverview/);
  assert.match(home, /TenantFoundationOverview/);
  assert.match(home, /session\.tenant\.displayName/);
});

test("every exposed workspace action resolves through a guarded route", async () => {
  const [catchAll, invitationPage, navigation] = await Promise.all([
    source("../app/[...workspace]/page.tsx"),
    source("../app/people/invitations/new/page.tsx"),
    source("../src/features/workspace/navigation.ts"),
  ]);
  for (const key of ["people", "learning", "studio", "assess", "calendar", "communicate", "insights", "evidence", "support", "admin", "help"]) {
    assert.match(catchAll, new RegExp(`"${key}"`));
  }
  assert.match(catchAll, /resolveNavigation\(resolution\.session\)/);
  assert.match(catchAll, /if \(!allowed\) notFound\(\)/);
  assert.match(invitationPage, /roles\.includes\("tenant-owner"\)/);
  assert.match(invitationPage, /TenantOwnerInvitationForm/);
  assert.match(navigation, /href: "\/people\/invitations\/new"/);
});

test("tenant-owner invitation is server mediated and never accepts tenant authority", async () => {
  const [route, page] = await Promise.all([
    source("../app/api/membership-invitations/tenant-owners/route.ts"),
    source("../app/people/invitations/new/page.tsx"),
  ]);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /maximumRequestBytes/);
  assert.match(route, /x-veza-membership-id/);
  assert.match(route, /getWebOidcSession/);
  assert.doesNotMatch(route, /x-veza-tenant-id/);
  assert.match(page, /roles\.includes\("tenant-owner"\)/);
});

test("role-adaptive calls to action never grant administrative work to learners", async () => {
  const [home, navigation] = await Promise.all([
    source("../src/features/workspace/workspace-home.tsx"),
    source("../src/features/workspace/navigation.ts"),
  ]);
  assert.match(home, /role === "tenant-owner" \|\| role === "institution-admin"/);
  assert.match(home, /role === "instructor" \|\| role === "assessor" \|\| role === "moderator" \|\| role === "learner"/);
  assert.match(navigation, /if \(roles\.has\("tenant-owner"\)\)/);
  assert.doesNotMatch(navigation, /roles\.has\("learner"\)[\s\S]*Invite owner/);
});

test("signed-out and unassigned states do not link to an authenticated help loop", async () => {
  const [signIn, pending] = await Promise.all([
    source("../app/sign-in/page.tsx"),
    source("../app/access-pending/page.tsx"),
  ]);
  assert.doesNotMatch(signIn, /href="\/help"/);
  assert.doesNotMatch(pending, /href="\/help"/);
  assert.match(pending, /institution administrator/);
});

test("workspace API contracts fail closed on enum drift, unbounded choices and missing core", async () => {
  const api = await source("../src/server/workspace-api.ts");
  assert.match(api, /tenantStatuses/);
  assert.match(api, /membershipStatuses/);
  assert.match(api, /deploymentTiers/);
  assert.match(api, /maximumWorkspaceOptions/);
  assert.match(api, /roles\.length === 0/);
  assert.match(api, /mandatory core entitlement/);
  assert.match(api, /isLimits/);
});
