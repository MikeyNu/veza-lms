import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  ExportExpiryHandler,
  ExportProcessor,
  type ExportObjectStore,
} from "../src/export-processor.js";

const job = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  export_type: "transcript" as const,
  format: "pdf" as const,
  attempts: 1,
  maximum_attempts: 5,
};

const payload = {
  exportId: job.id,
  title: "Learner transcript export",
  generatedAt: "2026-08-06T01:00:00.000Z",
  tenantName: "Sgela Academy",
  institutionName: "Johannesburg Campus",
  columns: ["learnerName", "courseTitle", "completionResult"],
  rows: [{ learnerName: "Naledi Mokoena", courseTitle: "Project Management", completionResult: 84 }],
  filters: { learnerPersonId: "33333333-3333-4333-8333-333333333333" },
};

function successHarness() {
  const calls: Array<{ readonly sql: string; readonly values?: readonly unknown[] }> = [];
  const pool = {
    async query(sql: string, values?: readonly unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("claim_export_jobs")) return { rows: [job] };
      if (sql.includes("export_document_payload")) return { rows: [{ payload }] };
      if (sql.includes("complete_export_job")) return { rows: [{ completed: true }] };
      if (sql.includes("fail_export_job")) return { rows: [{ failed: true }] };
      if (sql.includes("expire_export_jobs")) return { rows: [{ expired: 2 }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as Pool;
  const stored: Array<{
    readonly objectKey: string;
    readonly mediaType: string;
    readonly checksumSha256: string;
    readonly bytes: Buffer;
  }> = [];
  const objectStore: ExportObjectStore = {
    async put(input) {
      stored.push(input);
      return { objectKey: input.objectKey };
    },
  };
  return { pool, calls, stored, objectStore };
}

test("export processor claims, renders, persists and completes a governed PDF", async () => {
  const harness = successHarness();
  const processor = new ExportProcessor(
    harness.pool,
    harness.objectStore,
    "worker-qe",
    5,
    300,
    86400,
    5,
    3600,
  );
  const result = await processor.processDue();
  assert.deepEqual(result, { claimed: 1, completed: 1, failed: 0 });
  assert.equal(harness.stored.length, 1);
  assert.equal(harness.stored[0]?.mediaType, "application/pdf");
  assert.equal(harness.stored[0]?.bytes.subarray(0, 8).toString("ascii"), "%PDF-1.7");
  assert.equal(
    harness.stored[0]?.objectKey,
    `exports/${job.tenant_id}/${job.export_type}/${job.id}.pdf`,
  );
  const completion = harness.calls.find((call) => call.sql.includes("complete_export_job"));
  assert.ok(completion);
  assert.equal(completion.values?.[0], job.id);
  assert.equal(completion.values?.[1], "worker-qe");
  assert.equal(completion.values?.[2], 1);
  assert.equal(completion.values?.[4], harness.stored[0]?.checksumSha256);
  assert.equal(completion.values?.[5], 1);
});

test("export processor records a retry when object persistence fails", async () => {
  const harness = successHarness();
  const processor = new ExportProcessor(
    harness.pool,
    { async put() { throw new Error("storage-temporarily-unavailable"); } },
    "worker-qe",
    5,
    300,
    86400,
    5,
    3600,
  );
  const result = await processor.processDue();
  assert.deepEqual(result, { claimed: 1, completed: 0, failed: 1 });
  assert.equal(harness.calls.some((call) => call.sql.includes("complete_export_job")), false);
  const failure = harness.calls.find((call) => call.sql.includes("fail_export_job"));
  assert.ok(failure);
  assert.equal(failure.values?.[0], job.id);
  assert.equal(failure.values?.[1], "worker-qe");
  assert.match(String(failure.values?.[3]), /storage-temporarily-unavailable/);
  assert.ok(failure.values?.[4] instanceof Date);
});

test("export expiry handler executes the persisted expiry function", async () => {
  const harness = successHarness();
  const result = await new ExportExpiryHandler(harness.pool).execute();
  assert.deepEqual(result, { expired: 2 });
});
