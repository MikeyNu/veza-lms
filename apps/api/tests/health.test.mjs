import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("health endpoints separate process liveness from dependency readiness", async () => {
  const [controller, service, module] = await Promise.all([
    source("../src/modules/health/health.controller.ts"),
    source("../src/modules/health/health.service.ts"),
    source("../src/modules/health/health.module.ts"),
  ]);
  assert.match(controller, /@Get\("live"\)/);
  assert.match(controller, /@Get\("ready"\)/);
  assert.match(service, /controlPlaneQuery\("SELECT 1 AS ready"\)/);
  assert.match(service, /pending_events/);
  assert.match(service, /dead_letter_events/);
  assert.match(service, /oldest_pending_seconds/);
  assert.match(service, /ServiceUnavailableException/);
  assert.match(module, /HealthService/);
});

test("readiness reports only service-level state and no tenant records", async () => {
  const service = await source("../src/modules/health/health.service.ts");
  assert.match(service, /OUTBOX_DEGRADED_PENDING_EVENTS/);
  assert.match(service, /OUTBOX_DEGRADED_AGE_SECONDS/);
  assert.match(service, /deadLetterEvents > 0/);
  assert.doesNotMatch(service, /display_name|legal_name|membership_invitations|audit_events/);
});
