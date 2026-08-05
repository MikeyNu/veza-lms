import test from "node:test";
import assert from "node:assert/strict";
import { nextAttemptAt, retryDelaySeconds } from "../src/retry.js";

test("retry delay is deterministic, jittered and bounded", () => {
  const first = retryDelaySeconds("00000000-0000-4000-8000-000000000001", 1, 5, 3_600);
  const repeated = retryDelaySeconds("00000000-0000-4000-8000-000000000001", 1, 5, 3_600);
  const later = retryDelaySeconds("00000000-0000-4000-8000-000000000001", 8, 5, 3_600);
  const exhausted = retryDelaySeconds("00000000-0000-4000-8000-000000000001", 100, 5, 3_600);
  assert.equal(first, repeated);
  assert.ok(first >= 4 && first <= 6);
  assert.ok(later > first);
  assert.ok(exhausted <= 3_600);
});

test("next-attempt calculation preserves an explicit clock", () => {
  const now = new Date("2027-01-01T00:00:00.000Z");
  assert.equal(nextAttemptAt(now, 15).toISOString(), "2027-01-01T00:00:15.000Z");
});
