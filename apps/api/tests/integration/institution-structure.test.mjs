import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

function required(name) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required for database integration tests`);
  return value;
}

const appPool = new Pool({
  connectionString: required("DATABASE_URL"),
  max: 4,
  statement_timeout: 10_000,
});
const controlPool = new Pool({
  connectionString: required("CONTROL_PLANE_DATABASE_URL"),
  max: 2,
  statement_timeout: 10_000,
});

const runId = randomUUID();
const actorA = randomUUID();
const actorB = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();
const institutionA = randomUUID();
const institutionB = randomUUID();
const rootUnit = randomUUID();
const childUnit = randomUUID();
const yearPeriod = randomUUID();
const termPeriod = randomUUID();

async function withTenant(tenantId, callback, commit = false) {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      tenantId,
    ]);
    await client.query(
      "SELECT set_config('app.data_plane', 'application', true)",
    );
    const result = await callback(client);
    await client.query(commit ? "COMMIT" : "ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedControlPlane() {
  await controlPool.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, display_name, status)
     VALUES
       ($1, 'https://institution.integration.invalid', $2, $3, 'Institution owner A', 'active'),
       ($4, 'https://institution.integration.invalid', $5, $6, 'Institution owner B', 'active')`,
    [
      actorA,
      `owner-a-${runId}`,
      `owner-a-${runId}@example.invalid`,
      actorB,
      `owner-b-${runId}`,
      `owner-b-${runId}@example.invalid`,
    ],
  );
  await controlPool.query(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES
       ($1, $2, 'Institution tenant A', 'Institution tenant A', 'active', 'shared', 'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $3),
       ($4, $5, 'Institution tenant B', 'Institution tenant B', 'active', 'shared', 'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $6)`,
    [
      tenantA,
      `institution-a-${runId}`,
      actorA,
      tenantB,
      `institution-b-${runId}`,
      actorB,
    ],
  );
}

async function seedInstitutions() {
  await withTenant(
    tenantA,
    async (client) => {
      await client.query(
        `INSERT INTO institutions (
         id, tenant_id, code, display_name, institution_type, status, locale, timezone, created_by
       ) VALUES ($1, $2, 'MAIN', 'Institution A', 'university', 'active', 'en-ZA', 'Africa/Johannesburg', $3)`,
        [institutionA, tenantA, actorA],
      );
      await client.query(
        `INSERT INTO organisational_units (
         id, tenant_id, institution_id, code, display_name, unit_type, created_by
       ) VALUES
         ($1, $2, $3, 'ROOT', 'Root faculty', 'faculty', $4),
         ($5, $2, $3, 'CHILD', 'Child department', 'department', $4)`,
        [rootUnit, tenantA, institutionA, actorA, childUnit],
      );
      await client.query(
        "UPDATE organisational_units SET parent_unit_id = $1 WHERE id = $2",
        [rootUnit, childUnit],
      );
      await client.query(
        `INSERT INTO academic_periods (
         id, tenant_id, institution_id, code, display_name, period_type, status,
         starts_on, ends_on, timezone, created_by
       ) VALUES
         ($1, $2, $3, '2027', 'Academic year 2027', 'academic-year', 'draft', '2027-01-01', '2027-12-31', 'Africa/Johannesburg', $4),
         ($5, $2, $3, 'T1', 'Term 1', 'term', 'draft', '2027-01-15', '2027-04-15', 'Africa/Johannesburg', $4)`,
        [yearPeriod, tenantA, institutionA, actorA, termPeriod],
      );
      await client.query(
        "UPDATE academic_periods SET parent_period_id = $1 WHERE id = $2",
        [yearPeriod, termPeriod],
      );
    },
    true,
  );

  await withTenant(
    tenantB,
    async (client) => {
      await client.query(
        `INSERT INTO institutions (
         id, tenant_id, code, display_name, institution_type, status, locale, timezone, created_by
       ) VALUES ($1, $2, 'MAIN', 'Institution B', 'college', 'active', 'en-ZA', 'Africa/Johannesburg', $3)`,
        [institutionB, tenantB, actorB],
      );
    },
    true,
  );
}

test.before(async () => {
  await seedControlPlane();
  await seedInstitutions();
});

test.after(async () => {
  await Promise.all([appPool.end(), controlPool.end()]);
});

test("institution tables fail closed without tenant context", async () => {
  const result = await appPool.query(
    "SELECT id FROM institutions WHERE id = ANY($1::uuid[])",
    [[institutionA, institutionB]],
  );
  assert.equal(result.rowCount, 0);
});

test("institution reads are restricted to the selected tenant", async () => {
  await withTenant(tenantA, async (client) => {
    const result = await client.query(
      "SELECT id FROM institutions WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[institutionA, institutionB]],
    );
    assert.deepEqual(
      result.rows.map((row) => row.id),
      [institutionA],
    );
  });
});

test("cross-tenant institution writes are rejected by RLS", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        `INSERT INTO institutions (
         tenant_id, code, display_name, institution_type, status, locale, timezone, created_by
       ) VALUES ($1, 'CROSS', 'Cross tenant institution', 'other', 'draft', 'en-ZA', 'Africa/Johannesburg', $2)`,
        [tenantB, actorA],
      ),
    ),
    /row-level security|violates row-level security/i,
  );
});

test("composite foreign keys reject a campus attached to another tenant institution", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        `INSERT INTO campuses (
         tenant_id, institution_id, code, display_name, delivery_mode, status,
         is_primary, timezone, created_by
       ) VALUES ($1, $2, 'INVALID', 'Invalid campus', 'physical', 'active', false, 'Africa/Johannesburg', $3)`,
        [tenantA, institutionB, actorA],
      ),
    ),
    /foreign key|row-level security/i,
  );
});

test("only one non-archived primary campus can exist per institution", async () => {
  await withTenant(tenantA, async (client) => {
    await client.query(
      `INSERT INTO campuses (
         tenant_id, institution_id, code, display_name, delivery_mode, status,
         is_primary, timezone, created_by
       ) VALUES ($1, $2, 'PRIMARY-A', 'Primary campus', 'hybrid', 'active', true, 'Africa/Johannesburg', $3)`,
      [tenantA, institutionA, actorA],
    );
    await assert.rejects(
      client.query(
        `INSERT INTO campuses (
           tenant_id, institution_id, code, display_name, delivery_mode, status,
           is_primary, timezone, created_by
         ) VALUES ($1, $2, 'PRIMARY-B', 'Second primary campus', 'physical', 'active', true, 'Africa/Johannesburg', $3)`,
        [tenantA, institutionA, actorA],
      ),
      /duplicate key|unique constraint/i,
    );
  });
});

test("organisational-unit cycles are rejected by the database", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        "UPDATE organisational_units SET parent_unit_id = $1 WHERE id = $2",
        [childUnit, rootUnit],
      ),
    ),
    /cannot contain a cycle/i,
  );
});

test("child academic periods must remain inside their parent", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        `INSERT INTO academic_periods (
         tenant_id, institution_id, parent_period_id, code, display_name, period_type,
         status, starts_on, ends_on, timezone, created_by
       ) VALUES ($1, $2, $3, 'OUTSIDE', 'Outside period', 'term', 'draft', '2026-12-01', '2027-02-01', 'Africa/Johannesburg', $4)`,
        [tenantA, institutionA, yearPeriod, actorA],
      ),
    ),
    /must remain inside the parent period/i,
  );
});

test("a parent period cannot be shrunk around an existing child", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        "UPDATE academic_periods SET starts_on = '2027-02-01' WHERE id = $1",
        [yearPeriod],
      ),
    ),
    /cannot exclude an existing child period/i,
  );
});

test("a child period cannot be published before its parent", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        `UPDATE academic_periods SET status = 'published', published_by = $1, published_at = now() WHERE id = $2`,
        [actorA, termPeriod],
      ),
    ),
    /parent academic period must be published/i,
  );
});

test("published academic-period structure is immutable", async () => {
  await withTenant(tenantA, async (client) => {
    await client.query(
      `UPDATE academic_periods SET status = 'published', published_by = $1, published_at = now() WHERE id = $2`,
      [actorA, yearPeriod],
    );
    await assert.rejects(
      client.query(
        "UPDATE academic_periods SET ends_on = '2027-12-30' WHERE id = $1",
        [yearPeriod],
      ),
      /structurally immutable/i,
    );
  });
});

test("approved policy content is immutable and only one current version may exist", async () => {
  await withTenant(tenantA, async (client) => {
    const first = randomUUID();
    await client.query(
      `INSERT INTO institutional_policies (
         id, tenant_id, institution_id, policy_key, version, status, title,
         content, content_checksum, effective_from, created_by, approved_by, approved_at
       ) VALUES ($1, $2, $3, 'privacy', 1, 'approved', 'Privacy policy',
                 '{"version":1}'::jsonb, 'checksum-1', '2027-01-01', $4, $4, now())`,
      [first, tenantA, institutionA, actorA],
    );
    await client.query("SAVEPOINT expected_immutable_policy");
    await assert.rejects(
      client.query(
        "UPDATE institutional_policies SET content = '{\"version\":2}'::jsonb WHERE id = $1",
        [first],
      ),
      /content is immutable/i,
    );
    await client.query("ROLLBACK TO SAVEPOINT expected_immutable_policy");
    await client.query("RELEASE SAVEPOINT expected_immutable_policy");
    await client.query("SAVEPOINT expected_current_policy_conflict");
    await assert.rejects(
      client.query(
        `INSERT INTO institutional_policies (
           tenant_id, institution_id, policy_key, version, status, title,
           content, content_checksum, effective_from, created_by, approved_by, approved_at
         ) VALUES ($1, $2, 'privacy', 2, 'approved', 'Concurrent privacy policy',
                   '{"version":2}'::jsonb, 'checksum-2', '2027-02-01', $3, $3, now())`,
        [tenantA, institutionA, actorA],
      ),
      /duplicate key|unique constraint/i,
    );
    await client.query(
      "ROLLBACK TO SAVEPOINT expected_current_policy_conflict",
    );
    await client.query("RELEASE SAVEPOINT expected_current_policy_conflict");
  });
});
