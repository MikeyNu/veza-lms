import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("dead-letter operations are operator guarded, bounded and payload blind", async () => {
  const [controller, service] = await Promise.all([
    source("../src/modules/platform-operations/http/control-plane-dead-letters.controller.ts"),
    source("../src/modules/platform-operations/application/dead-letter-operations.service.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /ParseUUIDPipe/);
  assert.match(controller, /idempotency-key/);
  assert.match(service, /dead_lettered_at IS NOT NULL/);
  assert.match(service, /platform_operation_requests/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /this\.tenantAudit\.append/);
  assert.match(service, /this\.platformAudit\.append/);
  assert.doesNotMatch(service, /SELECT[\s\S]{0,220}payload/);
});

test("requeue resets delivery state while preserving prior evidence in audit", async () => {
  const service = await source("../src/modules/platform-operations/application/dead-letter-operations.service.ts");
  assert.match(service, /attempts = 0/);
  assert.match(service, /dead_lettered_at = NULL/);
  assert.match(service, /last_error = NULL/);
  assert.match(service, /errorFingerprint/);
  assert.match(service, /platform\.outbox-dead-letter-requeued/);
  assert.match(service, /outbox\.dead-letter-requeued/);
});
