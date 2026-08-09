import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("release governance is control-plane owned and application evaluation is transaction local", async () => {
  const [migration, service, controller] = await Promise.all([
    source("../database/migrations/0007_release_governance.sql"),
    source("../src/platform/feature-flags/feature-flag.service.ts"),
    source("../src/platform/feature-flags/feature-flags.controller.ts"),
  ]);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON release_rings/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]+release_rings[^;]+TO veza_app/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /WHERE app\.current_tenant_id\(\) IS NOT NULL/);
  assert.match(migration, /tenant-override/);
  assert.match(migration, /release-ring/);
  assert.match(migration, /required_module_key/);
  assert.match(service, /withTenantTransaction/);
  assert.match(service, /app\.current_feature_flags\(\)/);
  assert.match(controller, /TenantMembershipGuard/);
});

test("release-governance inspection is operator guarded and contains no academic content joins", async () => {
  const [controller, service, completion] = await Promise.all([
    source("../src/modules/platform-operations/http/control-plane-release-governance.controller.ts"),
    source("../src/modules/platform-operations/application/release-governance.service.ts"),
    source("../src/modules/platform-operations/application/release-completion.service.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /ParseUUIDPipe/);
  assert.match(service, /release_rings/);
  assert.match(service, /tenant_release_assignments/);
  assert.match(service, /GROUP BY ring\.key,ring\.display_name,ring\.description,ring\.sequence/);
  assert.match(completion, /GROUP BY ring\.key,ring\.display_name,ring\.description,ring\.sequence/);
  assert.match(completion, /GROUP BY target\.id,ring\.display_name,ring\.sequence/);
  assert.doesNotMatch(service, /learners|submissions|assessments|course_content|grades/i);
});
