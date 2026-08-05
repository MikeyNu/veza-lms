import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for database integration tests`);
  return value;
}

const appPool = new Pool({ connectionString: required("DATABASE_URL"), max: 3, statement_timeout: 10_000 });
const controlPool = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2, statement_timeout: 10_000 });
const suffix = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();
const actor = randomUUID();
const memberUser = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();
const assignmentA = randomUUID();

async function withTenant(tenantId, callback, commit = false) {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.data_plane', 'application', true)");
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

test.before(async () => {
  await controlPool.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, display_name)
     VALUES
       ($1, 'https://access.integration.invalid', $2, $3, 'Access administrator'),
       ($4, 'https://access.integration.invalid', $5, $6, 'Access member')`,
    [actor, `actor-${suffix}`, `actor-${suffix}@example.invalid`, memberUser, `member-${suffix}`, `member-${suffix}@example.invalid`],
  );
  await controlPool.query(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES
       ($1, $2, 'Access tenant A', 'Access tenant A', 'active', 'shared', 'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $3),
       ($4, $5, 'Access tenant B', 'Access tenant B', 'active', 'shared', 'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $3)`,
    [tenantA, `access-a-${suffix}`, actor, tenantB, `access-b-${suffix}`],
  );
  await controlPool.query(
    `INSERT INTO memberships (id, tenant_id, user_id, status)
     VALUES ($1,$2,$3,'active'),($4,$5,$3,'active')`,
    [membershipA, tenantA, memberUser, membershipB, tenantB],
  );
});

test.after(async () => {
  await Promise.all([appPool.end(), controlPool.end()]);
});

test("overlapping grants for the same role and scope are rejected", async () => {
  await withTenant(tenantA, async (client) => {
    await client.query(
      `INSERT INTO role_assignments (
         id, tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
       ) VALUES ($1,$2,$3,'auditor','tenant',$2,$4)`,
      [assignmentA, tenantA, membershipA, actor],
    );
    await assert.rejects(
      client.query(
        `INSERT INTO role_assignments (
           tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
         ) VALUES ($1,$2,'auditor','tenant',$1,$3)`,
        [tenantA, membershipA, actor],
      ),
      /conflicting key value violates exclusion constraint|role_assignments_no_overlapping_grant/i,
    );
  }, true);
});

test("an ended role preserves evidence and can be reassigned later", async () => {
  await withTenant(tenantA, async (client) => {
    const endedAt = new Date();
    await client.query(
      `UPDATE role_assignments
       SET valid_until = $3, ended_at = $3, ended_by = $4, end_reason = 'Responsibility transferred'
       WHERE tenant_id = $1 AND id = $2`,
      [tenantA, assignmentA, endedAt, actor],
    );
    const ended = await client.query(
      `SELECT ended_by, ended_at, end_reason FROM role_assignments WHERE tenant_id = $1 AND id = $2`,
      [tenantA, assignmentA],
    );
    assert.equal(ended.rows[0]?.ended_by, actor);
    assert.equal(ended.rows[0]?.end_reason, "Responsibility transferred");
    await client.query(
      `INSERT INTO role_assignments (
         tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
       ) VALUES ($1,$2,'auditor','tenant',$1,$3)`,
      [tenantA, membershipA, actor],
    );
  }, true);
});

test("application RLS prevents reading another tenant access assignments", async () => {
  await withTenant(tenantA, async (client) => {
    const result = await client.query(
      `SELECT membership_id FROM role_assignments WHERE membership_id = ANY($1::uuid[])`,
      [[membershipA, membershipB]],
    );
    assert.deepEqual(result.rows.map((row) => row.membership_id), [membershipA]);
  });
});
