import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { MediaProcessor } from "../src/media-processor.js";

const job = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  asset_id: "33333333-3333-4333-8333-333333333333",
  job_type: "verify-object",
  profile: {},
  attempts: 1,
  maximum_attempts: 5,
  bucket_key: "tenant-assets",
  object_key: "asset.bin",
  media_type: "application/octet-stream",
  byte_size: 128,
  checksum_sha256: "a".repeat(64),
  original_filename: "asset.bin",
};

function harness(ownsCompletion: boolean) {
  const calls: string[] = [];
  let claimed = false;
  const client = {
    async query(sql: string) {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("WITH candidates AS") && sql.includes("media_processing_jobs")) {
        if (claimed) return { rows: [], rowCount: 0 };
        claimed = true;
        return { rows: [job], rowCount: 1 };
      }
      if (sql.includes("SET state = 'completed'")) {
        return { rows: ownsCompletion ? [{ id: job.id }] : [], rowCount: ownsCompletion ? 1 : 0 };
      }
      if (sql.includes("SET state = $4")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
  } as unknown as Pool;
  return { pool, calls };
}

test("media worker claims one job at a time and can reclaim a stale processing job", async () => {
  const previousStub = process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB = "true";
  process.env.NODE_ENV = "test";
  try {
    const { pool, calls } = harness(true);
    const result = await new MediaProcessor(pool, "worker-qe", 1, 5, 3600).processDue();
    assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
    const claim = calls.find((sql) => sql.includes("WITH candidates AS"));
    assert.ok(claim);
    assert.match(claim, /job\.state = 'processing'/);
    assert.match(claim, /LIMIT 1/);
  } finally {
    if (previousStub === undefined) delete process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB;
    else process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB = previousStub;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("media worker proves lease ownership before mutating asset state", async () => {
  const previousStub = process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB = "true";
  process.env.NODE_ENV = "test";
  try {
    const { pool, calls } = harness(false);
    const result = await new MediaProcessor(pool, "worker-qe", 1, 5, 3600).processDue();
    assert.deepEqual(result, { claimed: 1, completed: 0, failed: 0 });
    assert.equal(calls.some((sql) => sql.includes("UPDATE media_upload_sessions")), false);
    assert.equal(calls.some((sql) => sql.includes("UPDATE media_assets")), false);
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO storage_usage_ledger")), false);
    assert.equal(calls.some((sql) => sql.includes("reconcile_media_asset")), false);
  } finally {
    if (previousStub === undefined) delete process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB;
    else process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB = previousStub;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
