import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("API application mounts the service account controllers", async () => {
  const [application, standardsModule, openApi, cache] = await Promise.all([
    read("src/app.module.ts"),
    read("src/platform/api-standards/api-standards.module.ts"),
    read("src/platform/api-standards/openapi.service.ts"),
    read("src/platform/cache/cache.service.ts"),
  ]);
  assert.match(application, /import \{ ApiStandardsModule \}/);
  assert.match(application, /imports:[\s\S]*ApiStandardsModule/);
  assert.match(standardsModule, /imports:\s*\[CacheModule, TenancyModule\]/);
  assert.match(standardsModule, /ServiceAccountController/);
  assert.match(openApi, /method: "get", path: "\/v1\/service-accounts"/);
  assert.match(cache, /defaultKeyPrefix\(process\.env\.VEZA_ENVIRONMENT_LABEL\)/);
  assert.match(cache, /replace\(\/\[\^a-z0-9\._-\]\+\/g, "-"\)/);
});

test("API application mounts permission-filtered workspace search", async () => {
  const [application, controller, search] = await Promise.all([
    read("src/app.module.ts"),
    read("src/platform/search/search.controller.ts"),
    read("src/platform/search/search.service.ts"),
  ]);
  assert.match(application, /import \{ SearchModule \}/);
  assert.match(application, /imports:[\s\S]*SearchModule/);
  assert.match(search, /\["programme-version", "course-blueprint", "course-run"\]/);
  assert.match(search, /href: "\/learning"/);
  assert.match(search, /studioManagementRoles/);
  assert.match(search, /`\/studio\/lessons\/\$\{entityId\}`/);
  assert.match(controller, /AuthenticationGuard, TenantMembershipGuard/);
  assert.doesNotMatch(controller, /permissions\.tenantRead/);
  assert.match(search, /document\.allowed_roles && \$3::text\[\]/);
  assert.match(search, /document\.institution_id = ANY\(\$5::uuid\[\]\)/);
});

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
  const [application, controller, operations] = await Promise.all([
    read("src/app.module.ts"),
    read("src/platform/observability/observability.controller.ts"),
    read("src/platform/observability/observability-operations.service.ts"),
  ]);
  assert.match(application, /import \{ ObservabilityModule \}/);
  assert.match(application, /imports:[\s\S]*ObservabilityModule/);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /@Post\("slos"\)/);
  assert.match(controller, /@Post\("alert-rules"\)/);
  assert.match(controller, /@Post\("alerts\/:id\/state"\)/);
  assert.match(controller, /@Post\("errors\/:id\/state"\)/);
  assert.match(operations, /platform_audit_events/);
  assert.match(operations, /error_budget_remaining/);
});
