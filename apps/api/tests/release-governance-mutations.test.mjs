import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("release mutations are operator guarded, idempotent and optimistic", async () => {
  const [controller, support, lifecycle, override] = await Promise.all([
    source("../src/modules/platform-operations/http/control-plane-release-governance.controller.ts"),
    source("../src/modules/platform-operations/application/release-governance-mutation-support.ts"),
    source("../src/modules/platform-operations/application/feature-flag-lifecycle.service.ts"),
    source("../src/modules/platform-operations/application/tenant-feature-override.service.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /idempotency-key/);
  assert.match(controller, /ParseUUIDPipe/);
  assert.match(support, /platform_operation_requests/);
  assert.match(support, /FOR UPDATE/);
  assert.match(support, /requireVersion/);
  assert.match(support, /Idempotency-Key was already used/);
  assert.match(support, /credentialPattern/);
  assert.match(lifecycle, /requireVersion/);
  assert.match(override, /requireVersion/);
});

test("tenant rollout changes are dual audited and entitlement constrained", async () => {
  const [ring, override] = await Promise.all([
    source("../src/modules/platform-operations/application/tenant-ring-assignment.service.ts"),
    source("../src/modules/platform-operations/application/tenant-feature-override.service.ts"),
  ]);
  for (const service of [ring, override]) {
    assert.match(service, /this\.tenantAudit\.append/);
    assert.match(service, /this\.platformAudit\.append/);
    assert.match(service, /offboarding or closed tenant/);
    assert.doesNotMatch(service, /learners|submissions|grades|course_content/i);
  }
  assert.match(ring, /tenant\.release-ring-assigned/);
  assert.match(override, /tenant\.feature-flag-configured/);
  assert.match(override, /requires the \$\{flag\.required_module_key\} entitlement/);
});

test("retired flags cannot be reactivated and inherit removes the tenant override", async () => {
  const [lifecycle, override] = await Promise.all([
    source("../src/modules/platform-operations/application/feature-flag-lifecycle.service.ts"),
    source("../src/modules/platform-operations/application/tenant-feature-override.service.ts"),
  ]);
  assert.match(lifecycle, /Retired feature flags cannot be reactivated/);
  assert.match(override, /DELETE FROM tenant_feature_flag_overrides/);
  assert.match(override, /state: input\.state, version/);
});
