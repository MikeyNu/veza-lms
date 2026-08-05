import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("platform audit is separately guarded and cursor paginated", async () => {
  const [controller, query, module] = await Promise.all([
    source("../src/modules/platform-operations/http/platform-audit.controller.ts"),
    source("../src/modules/platform-operations/application/platform-audit-query.service.ts"),
    source("../src/modules/platform-operations/platform-operations.module.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /control-plane\/audit-events/);
  assert.match(query, /platform_audit_events/);
  assert.match(query, /controlPlaneQuery/);
  assert.match(query, /nextCursor/);
  assert.match(module, /PlatformAuditWriter/);
});

test("tenant provisioning appends tenant and platform evidence atomically", async () => {
  const provisioning = await source("../src/modules/tenant-entitlements/application/provision-tenant.service.ts");
  assert.match(provisioning, /withControlPlaneTransaction/);
  assert.match(provisioning, /this\.audit\.append/);
  assert.match(provisioning, /this\.platformAudit\.append/);
  assert.match(provisioning, /platform\.tenant-provisioned/);
  assert.doesNotMatch(provisioning, /ownerEmail:[\s\S]{0,150}platformAudit\.append/);
});
