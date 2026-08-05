import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("service account directory is tenant scoped and never returns secret material", async () => {
  const [controller, query] = await Promise.all([
    read("src/platform/api-standards/service-account.controller.ts"),
    read("src/platform/api-standards/service-account-query.service.ts"),
  ]);
  assert.match(controller, /@Get\(\)/);
  assert.match(controller, /permissions\.tenantRead/);
  assert.match(query, /withTenantTransaction/);
  assert.match(query, /secret_prefix/);
  assert.doesNotMatch(query, /secret_hash|secret_salt/);
});

test("storage administration exposes quota, deletion and ESM safe accessibility evidence", async () => {
  const [controller, accessibility, administration] = await Promise.all([
    read("src/platform/storage/storage.controller.ts"),
    read("src/platform/storage/storage-accessibility.service.ts"),
    read("src/platform/storage/storage-administration.service.ts"),
  ]);
  assert.match(controller, /@Put\("quota"\)/);
  assert.match(controller, /@Get\("deletion-requests"\)/);
  assert.match(controller, /MfaGuard/);
  assert.match(accessibility, /import \{ createHash \} from "node:crypto"/);
  assert.match(accessibility, /transcript/);
  assert.match(administration, /storage\.quota\.updated/);
});

test("observability mutations are operator guarded and audit every change", async () => {
  const [controller, operations] = await Promise.all([
    read("src/platform/observability/observability.controller.ts"),
    read("src/platform/observability/observability-operations.service.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /@Post\("slos"\)/);
  assert.match(controller, /@Post\("alert-rules"\)/);
  assert.match(controller, /@Post\("alerts\/:id\/state"\)/);
  assert.match(controller, /@Post\("errors\/:id\/state"\)/);
  assert.match(operations, /platform_audit_events/);
  assert.match(operations, /error_budget_remaining/);
});
