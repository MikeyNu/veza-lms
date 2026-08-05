import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const app = new Pool({ connectionString: required("DATABASE_URL"), max: 6, statement_timeout: 15_000 });
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2, statement_timeout: 15_000 });
const runId = randomUUID();
const tenantId = randomUUID();
const actorId = randomUUID();
const institutionId = randomUUID();
const campusA = randomUUID();
const campusB = randomUUID();

async function transaction(operation) {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.data_plane', 'application', true)");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test.before(async () => {
  await control.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, display_name, status)
     VALUES ($1, 'https://concurrency.qe.invalid', $2, $3, 'Concurrency owner', 'active')`,
    [actorId, runId, `concurrency-${runId}@example.invalid`],
  );
  await control.query(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES ($1, $2, 'Concurrency tenant', 'Concurrency tenant', 'active', 'shared',
               'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $3)`,
    [tenantId, `concurrency-${runId}`, actorId],
  );
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO institutions (
         id, tenant_id, code, display_name, institution_type, status, locale, timezone, created_by
       ) VALUES ($1, $2, 'MAIN', 'Concurrency Institute', 'university', 'active', 'en-ZA', 'Africa/Johannesburg', $3)`,
      [institutionId, tenantId, actorId],
    );
    await client.query(
      `INSERT INTO campuses (
         id, tenant_id, institution_id, code, display_name, delivery_mode, status, is_primary, timezone, created_by
       ) VALUES
         ($1, $3, $4, 'A', 'Campus A', 'physical', 'active', false, 'Africa/Johannesburg', $5),
         ($2, $3, $4, 'B', 'Campus B', 'virtual', 'active', false, 'Africa/Johannesburg', $5)`,
      [campusA, campusB, tenantId, institutionId, actorId],
    );
  });
});

test.after(async () => Promise.all([app.end(), control.end()]));

test("concurrent primary-campus promotion leaves exactly one primary campus", async () => {
  const results = await Promise.allSettled([
    transaction((client) => client.query("UPDATE campuses SET is_primary = true WHERE id = $1", [campusA])),
    transaction((client) => client.query("UPDATE campuses SET is_primary = true WHERE id = $1", [campusB])),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  await transaction(async (client) => {
    const current = await client.query(
      "SELECT id FROM campuses WHERE institution_id = $1 AND is_primary = true AND status <> 'archived'",
      [institutionId],
    );
    assert.equal(current.rowCount, 1);
  });
});

test("concurrent first policy approval permits one current approved version", async () => {
  const insert = (checksum) => transaction((client) => client.query(
    `INSERT INTO institutional_policies (
       tenant_id, institution_id, policy_key, version, status, title, content,
       content_checksum, effective_from, created_by, approved_by, approved_at
     ) VALUES ($1, $2, 'privacy', 1, 'approved', 'Privacy policy', $3::jsonb,
               $4, current_date, $5, $5, now())`,
    [tenantId, institutionId, JSON.stringify({ checksum }), checksum, actorId],
  ));
  const results = await Promise.allSettled([insert(`a-${runId}`), insert(`b-${runId}`)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  await transaction(async (client) => {
    const current = await client.query(
      `SELECT version FROM institutional_policies
       WHERE institution_id = $1 AND policy_key = 'privacy' AND status = 'approved' AND effective_until IS NULL`,
      [institutionId],
    );
    assert.equal(current.rowCount, 1);
  });
});
