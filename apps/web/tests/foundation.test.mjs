import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("dashboard exposes one primary heading and semantic navigation", async () => {
  const overview = await source("../src/features/dashboard/dashboard-overview.tsx");
  const shell = await source("../src/components/app-shell-client.tsx");
  assert.equal((overview.match(/<h1/g) ?? []).length, 1);
  assert.match(shell, /aria-label="Primary workspace navigation"/);
  assert.match(shell, /aria-current/);
  assert.match(shell, /Mobile navigation/);
});

test("semantic status colours are declared as tokens", async () => {
  const resetCss = await source("../styles/reset.css");
  assert.match(resetCss, /--critical: var\(--veza-critical\)/);
  assert.match(resetCss, /--success: var\(--veza-success\)/);
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
  assert.match(home, /demo && role === "learner"/);
  assert.match(home, /TenantFoundationOverview/);
  assert.match(home, /session\.tenant\.displayName/);
});

test("every exposed workspace action resolves through a guarded route", async () => {
  const [policy, invitationPage, navigation, peoplePage, learningPage, studioPage, assessmentsPage] = await Promise.all([
    source("../src/features/workspace/access-policy.ts"),
    source("../app/people/invitations/new/page.tsx"),
    source("../src/features/workspace/navigation.ts"),
    source("../app/people/page.tsx"),
    source("../app/learning/page.tsx"),
    source("../app/studio/page.tsx"),
    source("../app/assessments/page.tsx"),
  ]);
  for (const key of ["people", "learning", "studio", "assess", "calendar", "communicate", "insights", "evidence", "support", "admin", "help"]) {
    assert.match(navigation, new RegExp(`key: "${key}"`));
  }
  for (const policyId of ["people", "learning", "studio", "assessments", "calendar", "communications", "insights", "evidence", "support", "administration", "help"]) {
    assert.match(policy, new RegExp(`id: "${policyId}"`));
  }
  assert.match(policy, /canAccessWorkspacePath/);
  for (const page of [peoplePage, learningPage, studioPage, assessmentsPage]) {
    assert.match(page, /requireWorkspaceSession/);
    assert.match(page, /notFound\(\)/);
  }
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
  assert.match(home, /if \(role === "learner"\)/);
  assert.match(navigation, /roles\.has\("tenant-owner"\)/);
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

test("foundation workspace has an explicit responsive bento hierarchy", async () => {
  const [foundation, globals] = await Promise.all([
    source("../styles/foundation.css"),
    source("../app/globals.css"),
  ]);
  assert.match(globals, /foundation\.css/);
  assert.match(foundation, /grid-template-areas:\s*"next boundary"\s*"modules access"/);
  assert.match(foundation, /foundation-boundary/);
  assert.match(foundation, /tenant-status\.provisioning/);
  assert.match(foundation, /@media \(max-width: 620px\)/);
});

test("institution setup is driven by verified API readiness rather than local completion flags", async () => {
  const [page, centre, panels, api] = await Promise.all([
    source("../app/admin/institution-setup/page.tsx"),
    source("../src/features/institution-setup/institution-setup-centre.tsx"),
    source("../src/features/institution-setup/tenant-setup-panels.tsx"),
    source("../src/server/institution-setup-api.ts"),
  ]);
  assert.match(page, /requireWorkspaceSession/);
  assert.match(page, /roles\.has\("tenant-owner"\)/);
  assert.match(page, /membership\.institutionIds/);
  assert.match(panels, /bundle\.readiness\?\.checks/);
  assert.match(panels, /disabled=\{!bundle\.readiness\.ready/);
  assert.match(api, /activation-readiness/);
  assert.match(api, /Activation check did not match the API contract/);
  assert.doesNotMatch(centre, /set.*passed/i);
});

test("institution setup BFF accepts only whitelisted membership-scoped operations", async () => {
  const route = await source("../app/api/institution-setup/[...path]/route.ts");
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /routes\.some/);
  assert.match(route, /x-veza-membership-id/);
  assert.match(route, /maximumRequestBytes/);
  assert.match(route, /containsSecretKey/);
  assert.doesNotMatch(route, /x-veza-tenant-id/);
});

test("institution setup has an explicit responsive task-driven bento hierarchy", async () => {
  const [css, globals] = await Promise.all([
    source("../styles/institution-setup.css"),
    source("../app/globals.css"),
  ]);
  assert.match(globals, /institution-setup\.css/);
  assert.match(css.replaceAll(/\s+/g, ""), /grid-template-columns:minmax\(240px,.72fr\)minmax\(580px,1.75fr\)minmax\(250px,.76fr\)/);
  assert.match(css, /setup-bento/);
  assert.match(css, /activation-rail/);
  assert.match(css, /@media \(max-width:\s*620px\)/);
});
