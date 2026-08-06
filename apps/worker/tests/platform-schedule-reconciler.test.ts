import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PlatformScheduleReconciler } from "../src/platform-schedule-reconciler.js";

test("platform schedule reconciler returns persisted global and tenant counts", async () => {
  const calls: string[] = [];
  const pool = {
    async query(sql: string) {
      calls.push(sql);
      return { rows: [{ result: { globalSchedules: 9, tenantSchedules: 4 } }] };
    },
  } as unknown as Pool;

  const result = await new PlatformScheduleReconciler(pool).reconcile();
  assert.deepEqual(result, { globalSchedules: 9, tenantSchedules: 4 });
  assert.deepEqual(calls, ["SELECT app.ensure_platform_schedules() result"]);
});

test("platform schedule reconciler normalises missing database counters", async () => {
  const pool = {
    async query() {
      return { rows: [{ result: null }] };
    },
  } as unknown as Pool;

  const result = await new PlatformScheduleReconciler(pool).reconcile();
  assert.deepEqual(result, { globalSchedules: 0, tenantSchedules: 0 });
});
