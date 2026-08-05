import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkerConfig } from "../src/config.js";
import { sanitizeDeliveryError } from "../src/delivery-error.js";

const originalEnvironment = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnvironment };
});

test("production cannot start with stdout delivery", () => {
  process.env.NODE_ENV = "production";
  process.env.OUTBOX_TRANSPORT = "stdout";
  process.env.WORKER_DATABASE_URL = "postgresql://worker@example.invalid/veza";
  assert.throws(() => loadWorkerConfig(), /prohibited in production/);
});

test("EventBridge timeout must remain shorter than the lease", () => {
  process.env.NODE_ENV = "test";
  process.env.OUTBOX_TRANSPORT = "eventbridge";
  process.env.WORKER_DATABASE_URL = "postgresql://worker@example.invalid/veza";
  process.env.EVENTBRIDGE_EVENT_BUS_NAME = "veza-test";
  process.env.AWS_REGION = "af-south-1";
  process.env.OUTBOX_LEASE_SECONDS = "10";
  process.env.EVENTBRIDGE_REQUEST_TIMEOUT_MS = "10000";
  assert.throws(() => loadWorkerConfig(), /shorter than the outbox lease/);
});

test("worker claims at most one EventBridge request per lease", () => {
  process.env.NODE_ENV = "test";
  process.env.OUTBOX_TRANSPORT = "eventbridge";
  process.env.WORKER_DATABASE_URL = "postgresql://worker@example.invalid/veza";
  process.env.EVENTBRIDGE_EVENT_BUS_NAME = "veza-test";
  process.env.AWS_REGION = "af-south-1";
  process.env.OUTBOX_BATCH_SIZE = "11";
  assert.throws(() => loadWorkerConfig(), /OUTBOX_BATCH_SIZE/);
});

test("delivery errors redact credentials and bearer tokens", () => {
  const sanitized = sanitizeDeliveryError(
    "authorization=secret-value client_secret=other-secret Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature failed",
  );
  assert.doesNotMatch(sanitized, /secret-value|other-secret|eyJhbGci/);
  assert.match(sanitized, /\[redacted\]/);
});
