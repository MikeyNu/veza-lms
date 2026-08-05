import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const formUrl = new URL("../src/features/tenants/tenant-provisioning-form.tsx", import.meta.url);
const routeUrl = new URL("../app/api/tenants/route.ts", import.meta.url);
const sessionUrl = new URL("../src/server/operator-session.ts", import.meta.url);

test("provisioning UI exposes tenancy, entitlement and owner decisions", async () => {
  const source = await readFile(formUrl, "utf8");
  for (const term of ["deploymentTier", "residencyRegion", "modules", "ownerEmail"]) assert.match(source, new RegExp(term));
  assert.match(source, /Core entitlement is mandatory/);
  assert.match(source, /Owner receives an invitation/);
});

test("control-plane browser never receives the operator token", async () => {
  const [route, session] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(sessionUrl, "utf8"),
  ]);
  assert.match(session, /readSessionCookie/);
  assert.match(session, /operatorSessionCookieName/);
  assert.match(route, /authorization: `Bearer \$\{session\.oidc\.accessToken\}`/);
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*accessToken/);
  assert.doesNotMatch(route, /cookies\(\)/);
});

test("privileged writes require same-origin JSON and bounded request bodies", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /application\/json/);
  assert.match(route, /maximumRequestBytes/);
  assert.match(route, /\{16,128\}/);
});

test("operator identity and provisioning responses are runtime validated and bounded", async () => {
  const [operatorApi, callback, route] = await Promise.all([
    readFile(new URL("../src/server/operator-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/callback/route.ts", import.meta.url), "utf8"),
    readFile(routeUrl, "utf8"),
  ]);
  assert.match(operatorApi, /maximumResponseBytes/);
  assert.match(operatorApi, /veza:platform-operator/);
  assert.match(operatorApi, /AbortSignal\.timeout\(10_000\)/);
  assert.match(callback, /loadOperatorPrincipal/);
  assert.match(route, /isProvisioningResponse/);
  assert.match(route, /safeError/);
  assert.doesNotMatch(route, /content-type": upstream\.headers/);
});

test("unimplemented control-plane sections are visibly non-interactive", async () => {
  const shell = await readFile(new URL("../src/components/control-plane-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /available: false/);
  assert.match(shell, /aria-disabled="true"/);
  assert.match(shell, /Introduced in a later implementation gate/);
});

test("operator entry requires MFA assurance and avoids a redundant sign-in loop", async () => {
  const signIn = await readFile(new URL("../app/sign-in/page.tsx", import.meta.url), "utf8");
  assert.match(signIn, /multi-factor assurance/);
  assert.match(signIn, /getOperatorSession/);
  assert.match(signIn, /redirect\("\/tenants\/new"\)/);
});

test("control-plane provisioning has an explicit responsive decision hierarchy", async () => {
  const [shellCss, provisioningCss, responsiveCss] = await Promise.all([
    readFile(new URL("../styles/shell.css", import.meta.url), "utf8"),
    readFile(new URL("../styles/provisioning.css", import.meta.url), "utf8"),
    readFile(new URL("../styles/responsive.css", import.meta.url), "utf8"),
  ]);
  assert.match(shellCss, /grid-template-columns: 238px minmax\(0, 1fr\)/);
  assert.match(shellCss, /cp-nav-item\.disabled/);
  assert.match(provisioningCss, /grid-template-columns: minmax\(230px,.72fr\) minmax\(520px,1.55fr\) minmax\(250px,.75fr\)/);
  assert.match(provisioningCss, /module-option:has\(input:focus-visible\)/);
  assert.match(responsiveCss, /@media \(max-width: 620px\)/);
  assert.match(responsiveCss, /prefers-reduced-motion/);
});

test("operator session cookies use strict same-site policy", async () => {
  const callback = await readFile(new URL("../app/api/auth/callback/route.ts", import.meta.url), "utf8");
  assert.match(callback, /sameSite: "strict"/);
  assert.match(callback, /httpOnly: true/);
  assert.match(callback, /secure: secureCookie\(\)/);
});
