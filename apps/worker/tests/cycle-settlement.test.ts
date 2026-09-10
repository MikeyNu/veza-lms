import assert from "node:assert/strict";
import test from "node:test";
import { settleProcessorCycle } from "../src/cycle-settlement.js";

test("processor cycle waits for every sibling before surfacing failure", async () => {
  let slowFinished = false;
  const slow = new Promise<number>((resolve) => {
    setTimeout(() => {
      slowFinished = true;
      resolve(42);
    }, 20);
  });

  await assert.rejects(
    settleProcessorCycle([
      Promise.reject(new Error("fast-failure")),
      slow,
    ] as const),
    /worker-processor-cycle-failed/,
  );
  assert.equal(slowFinished, true);
});

test("processor cycle preserves heterogeneous result ordering", async () => {
  const result = await settleProcessorCycle([
    Promise.resolve(7),
    Promise.resolve({ claimed: 2 }),
    Promise.resolve("done"),
  ] as const);

  assert.deepEqual(result, [7, { claimed: 2 }, "done"]);
});
