import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const mainWithoutWhitespace = main.replace(/\s+/g, "");

function sourceIncludes(token: string): boolean {
  return mainWithoutWhitespace.includes(token.replace(/\s+/g, ""));
}

const requiredRegistrations = [
  'consumerRuntime.register("communications.notification-router"',
  'consumerRuntime.register("search.projection-events"',
  'consumerRuntime.register("api.webhook-router"',
  'scheduler.register(\n    "communications.digest-preparation"',
  'scheduler.register(\n    "communications.delivery-reconciliation"',
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
  "platformScheduleReconciler.reconcile()",
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
    assert.ok(
      sourceIncludes(registration),
      `Missing worker registration: ${registration}`,
    );
  }
});

test("worker polling loop reconciles schedules and executes every runtime processor", () => {
  for (const executor of requiredExecutors) {
    assert.ok(sourceIncludes(executor), `Missing worker executor: ${executor}`);
  }
});
