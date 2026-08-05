import test from "node:test";
import assert from "node:assert/strict";
import type { PutEventsCommandOutput } from "@aws-sdk/client-eventbridge";
import { EventBridgePublisher } from "../src/event-publisher.js";
import type { ClaimedOutboxEvent } from "../src/outbox.types.js";

const baseEvent: ClaimedOutboxEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: "00000000-0000-4000-8000-000000000002",
  eventName: "tenant.activated",
  eventVersion: 1,
  aggregateType: "tenant",
  aggregateId: "00000000-0000-4000-8000-000000000002",
  aggregateVersion: 1,
  actorId: "00000000-0000-4000-8000-000000000003",
  correlationId: "correlation-1",
  payload: { state: "active" },
  occurredAt: "2026-08-05T00:00:00.000Z",
  attempts: 1,
};

const successMetadata = { httpStatusCode: 200, requestId: "test", attempts: 1, totalRetryDelay: 0 };

test("EventBridge publisher preserves per-entry success and failure", async () => {
  const client = {
    async send(): Promise<PutEventsCommandOutput> {
      return {
        FailedEntryCount: 1,
        Entries: [
          { EventId: "external-1" },
          { ErrorCode: "InternalFailure", ErrorMessage: "authorization=secret-value" },
        ],
        $metadata: successMetadata,
      };
    },
  };
  const publisher = new EventBridgePublisher("veza-test", "veza.learning-cloud", 5_000, "af-south-1", client);
  const results = await publisher.publish([
    baseEvent,
    { ...baseEvent, id: "00000000-0000-4000-8000-000000000004" },
  ]);
  assert.deepEqual(results.map((result) => result.success), [true, false]);
  assert.equal(results[0]?.reference, "external-1");
  assert.match(results[1]?.error ?? "", /InternalFailure/);
  assert.doesNotMatch(results[1]?.error ?? "", /secret-value/);
});

test("EventBridge publisher rejects an oversized entry before network delivery", async () => {
  let sends = 0;
  const client = {
    async send(): Promise<PutEventsCommandOutput> {
      sends += 1;
      return { FailedEntryCount: 0, Entries: [], $metadata: successMetadata };
    },
  };
  const publisher = new EventBridgePublisher("veza-test", "veza.learning-cloud", 5_000, "af-south-1", client);
  const results = await publisher.publish([{ ...baseEvent, payload: { value: "x".repeat(250 * 1024) } }]);
  assert.equal(sends, 0);
  assert.equal(results[0]?.success, false);
  assert.match(results[0]?.error ?? "", /entry-size safety limit/);
});
