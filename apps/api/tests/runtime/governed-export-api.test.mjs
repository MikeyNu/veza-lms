import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";
import { AcademicExportService } from "../../dist/modules/academic-evidence/application/academic-export.service.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  objectStoreUrl: process.env.EXPORT_OBJECT_STORE_URL,
  objectStoreToken: process.env.EXPORT_OBJECT_STORE_TOKEN,
  objectStoreTimeout: process.env.EXPORT_OBJECT_STORE_TIMEOUT_MS,
  maximumBytes: process.env.EXPORT_DOWNLOAD_MAXIMUM_BYTES,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of [
    ["NODE_ENV", originalEnvironment.nodeEnv],
    ["EXPORT_OBJECT_STORE_URL", originalEnvironment.objectStoreUrl],
    ["EXPORT_OBJECT_STORE_TOKEN", originalEnvironment.objectStoreToken],
    ["EXPORT_OBJECT_STORE_TIMEOUT_MS", originalEnvironment.objectStoreTimeout],
    ["EXPORT_DOWNLOAD_MAXIMUM_BYTES", originalEnvironment.maximumBytes],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const tenantId = "11111111-1111-4111-8111-111111111111";
const exportId = "22222222-2222-4222-8222-222222222222";

function harness(overrides = {}) {
  const now = Date.now();
  const row = {
    id: exportId,
    export_type: "gradebook",
    format: "pdf",
    status: "ready",
    checksum: overrides.checksum ?? null,
    row_count: "18",
    requested_at: new Date(now - 60_000),
    ready_at: new Date(now - 30_000),
    expires_at: overrides.expiresAt ?? new Date(now + 86_400_000),
    failure_reason: null,
    attempts: 1,
    object_key: "exports/tenant/gradebook/job.pdf",
    ...overrides,
  };
  const database = {
    async withTenantTransaction(selectedTenantId, operation) {
      assert.equal(selectedTenantId, tenantId);
      return operation({ async query() { return { rows: [row], rowCount: 1 }; } });
    },
  };
  const context = { require: () => ({ tenantId }) };
  return new AcademicExportService(database, context);
}

test("export status exposes a download path only for a ready unexpired artifact", async () => {
  const service = harness({ checksum: "a".repeat(64) });
  const status = await service.status(exportId);
  assert.equal(status.status, "ready");
  assert.equal(status.rowCount, 18);
  assert.match(status.requestedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(status.downloadPath, `/v1/academic-evidence/exports/${exportId}/download`);
});

test("export status treats a ready artifact past its expiry as expired", async () => {
  const service = harness({ checksum: "a".repeat(64), expiresAt: new Date(0) });
  const status = await service.status(exportId);
  assert.equal(status.status, "expired");
  assert.equal(status.downloadPath, null);
});

test("export download verifies object bytes against the persisted checksum", async () => {
  const bytes = Buffer.from("%PDF-1.7\nverified export\n%%EOF\n", "ascii");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  process.env.EXPORT_OBJECT_STORE_URL = "http://127.0.0.1:4900/exports";
  process.env.NODE_ENV = "test";
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(init?.headers["x-veza-tenant-id"], tenantId);
    assert.equal(init?.headers["x-veza-export-id"], exportId);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-length": String(bytes.length),
        "content-type": "application/pdf",
      },
    });
  };
  const result = await harness({ checksum }).download(exportId);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.mediaType, "application/pdf");
  assert.equal(result.checksum, checksum);
  assert.equal(result.fileName, `veza-gradebook-${exportId}.pdf`);
});

test("export download fails closed when object bytes do not match evidence", async () => {
  process.env.EXPORT_OBJECT_STORE_URL = "http://127.0.0.1:4900/exports";
  process.env.NODE_ENV = "test";
  globalThis.fetch = async () => new Response("tampered", {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
  await assert.rejects(harness({ checksum: "a".repeat(64) }).download(exportId), /checksum verification/i);
});

test("export download rejects mismatched media evidence", async () => {
  const bytes = Buffer.from("not a PDF");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  process.env.EXPORT_OBJECT_STORE_URL = "http://127.0.0.1:4900/exports";
  process.env.NODE_ENV = "test";
  globalThis.fetch = async () => new Response(bytes, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  await assert.rejects(harness({ checksum }).download(exportId), /media type/i);
});

test("export download rejects requested jobs before contacting object storage", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response(); };
  await assert.rejects(harness({ status: "requested", checksum: null, object_key: null }).download(exportId), /not ready/i);
  assert.equal(called, false);
});
