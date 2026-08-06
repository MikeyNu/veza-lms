import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const exists = async (path) => access(new URL(path, import.meta.url)).then(() => true, () => false);

const identityPages = [
  "../app/sign-in/page.tsx",
  "../app/select-workspace/page.tsx",
  "../app/access-pending/page.tsx",
  "../app/invitation/page.tsx",
  "../app/account-help/page.tsx",
  "../app/reset-password/page.tsx",
];

test("all institutional identity pages use the shared multi-panel gateway", async () => {
  for (const path of identityPages) {
    const page = await source(path);
    assert.match(page, /IdentityGateway/, `${path} does not use IdentityGateway`);
    assert.doesNotMatch(page, /className="auth-page"/, `${path} retains the legacy auth layout`);
  }
  const styles = await source("../styles/identity-gateway.css");
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.15fr\) minmax\(28rem, 0\.85fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.identity-story \{[\s\S]*min-height: auto/);
  assert.doesNotMatch(styles, /\.identity-story\s*\{[^}]*display:\s*none/s);
});

test("Veza never collects or resets institutional passwords locally", async () => {
  const [signIn, reset, accountHelp, links] = await Promise.all([
    source("../app/sign-in/page.tsx"),
    source("../app/reset-password/page.tsx"),
    source("../app/account-help/page.tsx"),
    source("../src/server/identity-provider-links.ts"),
  ]);
  for (const page of [signIn, reset, accountHelp]) {
    assert.doesNotMatch(page, /type="password"/);
    assert.doesNotMatch(page, /name="password"/);
  }
  assert.match(signIn, /\/api\/auth\/sign-in/);
  assert.match(reset, /identityProviderRecoveryUrl/);
  assert.match(accountHelp, /identityProviderRecoveryUrl/);
  assert.match(links, /url\.protocol !== "https:"/);
  assert.match(links, /url\.username \|\| url\.password \|\| url\.hash/);
});

test("invitation acceptance is same-origin, identity verified and membership scoped", async () => {
  const [page, route, client, api] = await Promise.all([
    source("../app/invitation/page.tsx"),
    source("../app/api/invitations/accept/route.ts"),
    source("../src/server/invitation-api.ts"),
    source("../../api/src/modules/identity-access/http/membership-invitations.controller.ts"),
  ]);
  assert.match(page, /getWebOidcSession/);
  assert.match(page, /invitationId/);
  assert.match(page, /token/);
  assert.match(page, /Use another identity/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /membershipCookieName/);
  assert.match(route, /httpOnly: true/);
  assert.match(route, /sameSite: "lax"/);
  assert.match(route, /referrer-policy/);
  assert.doesNotMatch(route, /x-veza-tenant-id/);
  assert.match(client, /authorization: `Bearer \$\{accessToken\}`/);
  assert.match(client, /isReceipt/);
  assert.match(api, /ExternalAuthenticationGuard/);
  assert.match(api, /membership-invitations/);
});

test("identity routes provide dedicated loading and recoverable failure surfaces", async () => {
  for (const route of ["sign-in", "select-workspace", "access-pending", "invitation", "account-help", "reset-password"]) {
    assert.equal(await exists(`../app/${route}/loading.tsx`), true, `${route} loading state is missing`);
    assert.equal(await exists(`../app/${route}/error.tsx`), true, `${route} error boundary is missing`);
  }
  const [loading, error] = await Promise.all([
    source("../src/components/identity/identity-route-loading.tsx"),
    source("../src/components/identity/identity-route-error.tsx"),
  ]);
  assert.match(loading, /Skeleton/);
  assert.match(loading, /role="status"/);
  assert.match(error, /Retry this step/);
  assert.match(error, /Your identity session and institutional access remain unchanged/);
});
