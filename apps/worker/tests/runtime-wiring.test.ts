import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

const requiredRegistrations = [
  'consumerRuntime.register("communications.notification-router"',
  'consumerRuntime.register("search.projection-events"',
  'consumerRuntime.register("api.webhook-router"',
  'scheduler.register(\n    "communications.digest-preparation"',
  'scheduler.register(\n    "support.session-expiry"',
  'scheduler.register(\n    "commercial.effective-date-sweep"',
  'scheduler.register(\n    "media.retention-reconciliation"',
  'scheduler.register(\n    "search.projection-reconciliation"',
  'scheduler.register("observability.slo-measurement"',
  'scheduler.register("observability.alert-evaluation"',
  'scheduler.register("api.runtime-cleanup"',
  'scheduler.register("api.webhook-reconciliation"',
  'scheduler.register("exports.expiry"',
];

const requiredExecutors = [
  "mediaProcessor.processDue()",
  "searchIndexPublisher.processDue()",
  "webhookDispatcher.processDue()",
  "exportProcessor.processDue()",
  'safeHeartbeat(heartbeat, "starting")',
  'safeHeartbeat(heartbeat, "ready")',
  'safeHeartbeat(heartbeat, "degraded")',
  'safeHeartbeat(heartbeat, "stopping")',
];

test("worker entry point registers every persisted consumer and schedule handler", () => {
  for (const registration of requiredRegistrations) {
    assert.ok(main.includes(registration), `Missing worker registration: ${registration}`);
  }
});

test("worker polling loop executes media, search, webhook, export and heartbeat capabilities", () => {
  for (const executor of requiredExecutors) {
    assert.ok(main.includes(executor), `Missing worker executor: ${executor}`);
  }
});
