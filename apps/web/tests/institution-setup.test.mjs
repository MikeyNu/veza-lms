import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("institution setup is driven by backend activation evidence, not local completion", async () => {
  const [page, centre, panels, api] = await Promise.all([
    source("../app/admin/institution-setup/page.tsx"),
    source("../src/features/institution-setup/institution-setup-centre.tsx"),
    source("../src/features/institution-setup/tenant-setup-panels.tsx"),
    source("../src/server/institution-setup-api.ts"),
  ]);
  assert.match(page, /loadTenantSetupBundle/);
  assert.match(page, /loadScopedInstitution/);
  assert.match(panels, /bundle\.readiness\?\.checks/);
  assert.match(panels, /disabled=\{!bundle\.readiness\.ready/);
  assert.match(api, /\/activation-readiness/);
  assert.doesNotMatch(centre, /set.*Complete/);
});

test("institution setup writes are whitelisted and membership scoped through the BFF", async () => {
  const route = await source("../app/api/institution-setup/[...path]/route.ts");
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /membershipCookieName/);
  assert.match(route, /x-veza-membership-id/);
  assert.match(route, /maximumRequestBytes/);
  assert.match(route, /maximumResponseBytes/);
  assert.match(route, /routes\.some/);
  assert.doesNotMatch(route, /x-veza-tenant-id/);
  assert.match(route, /accessToken\|refreshToken\|idToken\|clientSecret\|authorization/);
});

test("institution setup uses a responsive three-column task hierarchy", async () => {
  const [css, globals, navigation] = await Promise.all([
    source("../styles/institution-setup.css"),
    source("../app/globals.css"),
    source("../src/features/workspace/navigation.ts"),
  ]);
  assert.match(css.replaceAll(/\s+/g, ""), /grid-template-columns:minmax\(240px,.72fr\)minmax\(580px,1.75fr\)minmax\(250px,.76fr\)/);
  assert.match(css, /activation-rail/);
  assert.match(css, /setup-bento/);
  assert.match(css, /@media \(max-width:\s*620px\)/);
  assert.match(globals, /institution-setup\.css/);
  assert.match(navigation, /href: "\/admin\/institution-setup"/);
});
