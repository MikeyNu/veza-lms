import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("control-plane tenant fleet exposes operational metadata only", async () => {
  const [service, controller] = await Promise.all([
    source("../../api/src/modules/tenant-entitlements/application/tenant-operations.service.ts"),
    source("../../api/src/modules/tenant-entitlements/http/control-plane-tenants.controller.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /@Get\(\)/);
  assert.match(controller, /@Get\(":tenantId"\)/);
  assert.match(service, /controlPlaneQuery/);
  assert.match(service, /active_memberships/);
  assert.match(service, /pending_events/);
  assert.doesNotMatch(service, /submissions|assessment_attempts|lesson_content/);
});

test("tenant fleet UI validates bounded responses and preserves the content boundary", async () => {
  const [page, api, fleet, shell, css, globals] = await Promise.all([
    source("../app/tenants/page.tsx"),
    source("../src/server/tenant-fleet-api.ts"),
    source("../src/features/tenants/tenant-fleet.tsx"),
    source("../src/components/control-plane-shell.tsx"),
    source("../styles/tenant-fleet.css"),
    source("../app/globals.css"),
  ]);
  assert.match(page, /requireOperatorSession/);
  assert.match(api, /maximumResponseBytes/);
  assert.match(api, /loadTenantFleet/);
  assert.match(fleet, /Content boundary intact/);
  assert.match(shell, /href: "\/tenants"/);
  assert.match(css, /grid-template-columns:minmax\(0,2fr\) minmax\(300px,.72fr\)/);
  assert.match(globals, /tenant-fleet\.css/);
});
