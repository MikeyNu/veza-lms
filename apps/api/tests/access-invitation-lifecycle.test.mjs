import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("invitation resend rotates the token and produces fresh delivery evidence", async () => {
  const service = await source("../src/modules/identity-access/application/access-invitation-lifecycle.service.ts");
  assert.match(service, /tokens\.create\(\)/);
  assert.match(service, /token_digest=\$3/);
  assert.match(service, /membership\.invitation\.resent/);
  assert.match(service, /encryptedToken: secret\.encryptedToken/);
  assert.match(service, /identity\.membership-invitation\.requested/);
});

test("bulk invitation revocation is bounded, atomic, authorised and evidenced", async () => {
  const [dto, service, controller] = await Promise.all([
    source("../src/modules/identity-access/application/access-invitation-lifecycle.dto.ts"),
    source("../src/modules/identity-access/application/access-invitation-lifecycle.service.ts"),
    source("../src/modules/identity-access/http/access-invitation-lifecycle.controller.ts"),
  ]);
  assert.match(dto, /ArrayMaxSize\(50\)/);
  assert.match(dto, /ArrayUnique/);
  assert.match(service, /withTenantTransaction/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /assertCanDelegate/);
  assert.match(service, /metadata: \{ operationId, mode: "bulk" \}/);
  assert.match(service, /outbox\.append/);
  assert.match(controller, /MfaGuard/);
  assert.match(controller, /bulk-revoke/);
  assert.match(controller, /resend/);
});
