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

const appPool = new Pool({
  connectionString: required("DATABASE_URL"),
  max: 3,
  statement_timeout: 10_000,
});
const controlPool = new Pool({
  connectionString: required("CONTROL_PLANE_DATABASE_URL"),
  max: 3,
  statement_timeout: 10_000,
});

const runId = randomUUID();
const actorA = randomUUID();
const actorB = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();
const membershipA = randomUUID();
const membershipB = randomUUID();

async function controlQuery(text, values = []) {
  return controlPool.query(text, values);
}

async function withTenant(tenantId, callback) {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await callback(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seed() {
  await controlQuery(
    `INSERT INTO users (
       id, identity_issuer, identity_subject, email, display_name, status
     ) VALUES
       ($1, 'https://integration.veza.invalid', $2, $3, 'Tenant A owner', 'active'),
       ($4, 'https://integration.veza.invalid', $5, $6, 'Tenant B owner', 'active')`,
    [
      actorA,
      `tenant-a-${runId}`,
      `owner-a-${runId}@example.invalid`,
      actorB,
      `tenant-b-${runId}`,
      `owner-b-${runId}@example.invalid`,
    ],
  );

  await controlQuery(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES
       ($1, $2, 'Integration tenant A', 'Integration tenant A', 'active', 'shared',
        'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $3),
       ($4, $5, 'Integration tenant B', 'Integration tenant B', 'active', 'shared',
        'af-south-1', 'foundation', 'en-ZA', 'Africa/Johannesburg', $6)`,
    [
      tenantA,
      `integration-a-${runId}`,
      actorA,
      tenantB,
      `integration-b-${runId}`,
      actorB,
    ],
  );

  await controlQuery(
    `INSERT INTO tenant_entitlements (tenant_id, module_key, state, limits)
     VALUES ($1, 'core', 'enabled', '{}'::jsonb), ($2, 'core', 'enabled', '{}'::jsonb)`,
    [tenantA, tenantB],
  );

  await controlQuery(
    `INSERT INTO memberships (
       id, tenant_id, user_id, status, locale, timezone
     ) VALUES
       ($1, $2, $3, 'active', 'en-ZA', 'Africa/Johannesburg'),
       ($4, $5, $6, 'active', 'en-ZA', 'Africa/Johannesburg')`,
    [membershipA, tenantA, actorA, membershipB, tenantB, actorB],
  );

  await controlQuery(
    `INSERT INTO role_assignments (
       tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
     ) VALUES
       ($1, $2, 'tenant-owner', 'tenant', $1, $3),
       ($4, $5, 'tenant-owner', 'tenant', $4, $6)`,
    [tenantA, membershipA, actorA, tenantB, membershipB, actorB],
  );

  await controlQuery(
    `INSERT INTO membership_invitations (
       tenant_id, email, role_key, scope_type, scope_id, status,
       expires_at, invited_by
     ) VALUES
       ($1, $2, 'learner', 'tenant', $1, 'sent', now() + interval '1 day', $3),
       ($4, $5, 'learner', 'tenant', $4, 'sent', now() + interval '1 day', $6)`,
    [
      tenantA,
      `learner-a-${runId}@example.invalid`,
      actorA,
      tenantB,
      `learner-b-${runId}@example.invalid`,
      actorB,
    ],
  );
}

test.before(async () => {
  await seed();
});

test.after(async () => {
  await Promise.all([appPool.end(), controlPool.end()]);
});

test("application identity sees no tenant-owned rows without transaction-local context", async () => {
  const current = await appPool.query("SELECT app.current_tenant_id() AS tenant_id");
  assert.equal(current.rows[0]?.tenant_id, null);

  const tenants = await appPool.query(
    "SELECT id FROM tenants WHERE id = ANY($1::uuid[]) ORDER BY id",
    [[tenantA, tenantB]],
  );
  assert.equal(tenants.rowCount, 0);
});

test("application identity reads only the selected tenant", async () => {
  await withTenant(tenantA, async (client) => {
    const tenants = await client.query(
      "SELECT id FROM tenants WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[tenantA, tenantB]],
    );
    assert.deepEqual(tenants.rows.map((row) => row.id), [tenantA]);

    const memberships = await client.query(
      "SELECT tenant_id FROM memberships WHERE id = ANY($1::uuid[]) ORDER BY tenant_id",
      [[membershipA, membershipB]],
    );
    assert.deepEqual(memberships.rows.map((row) => row.tenant_id), [tenantA]);

    const assignments = await client.query(
      "SELECT tenant_id FROM role_assignments WHERE membership_id = ANY($1::uuid[])",
      [[membershipA, membershipB]],
    );
    assert.deepEqual(assignments.rows.map((row) => row.tenant_id), [tenantA]);
  });
});

test("application identity cannot insert a row for another tenant", async () => {
  await assert.rejects(
    withTenant(tenantA, (client) =>
      client.query(
        `INSERT INTO membership_invitations (
           tenant_id, email, role_key, scope_type, scope_id, status,
           expires_at, invited_by
         ) VALUES ($1, $2, 'learner', 'tenant', $1, 'sent', now() + interval '1 day', $3)`,
        [tenantB, `cross-tenant-${runId}@example.invalid`, actorA],
      ),
    ),
    /row-level security|violates row-level security/i,
  );
});

test("invitation and audit evidence remain tenant isolated", async () => {
  await withTenant(tenantA, async (client) => {
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, plane, event_type, actor_id, membership_id,
         resource_type, resource_id, correlation_id, metadata
       ) VALUES ($1, 'application', 'integration.rls-verified', $2, $3,
                 'tenant', $1::text, $4, '{}'::jsonb)`,
      [tenantA, actorA, membershipA, `integration-${runId}`],
    );

    const invitations = await client.query(
      "SELECT tenant_id FROM membership_invitations WHERE tenant_id = ANY($1::uuid[])",
      [[tenantA, tenantB]],
    );
    assert.ok(invitations.rowCount > 0);
    assert.ok(invitations.rows.every((row) => row.tenant_id === tenantA));

    const audit = await client.query(
      "SELECT tenant_id FROM audit_events WHERE event_type = 'integration.rls-verified'",
    );
    assert.deepEqual(audit.rows.map((row) => row.tenant_id), [tenantA]);
  });

  await withTenant(tenantB, async (client) => {
    const audit = await client.query(
      "SELECT tenant_id FROM audit_events WHERE event_type = 'integration.rls-verified'",
    );
    assert.equal(audit.rowCount, 0);
  });
});

test("application identity cannot read the control-plane idempotency ledger", async () => {
  await assert.rejects(
    appPool.query("SELECT idempotency_key FROM provisioning_requests LIMIT 1"),
    /permission denied/i,
  );
});

test("control-plane identity can inspect both tenants while application RLS remains forced", async () => {
  const result = await controlQuery(
    "SELECT id FROM tenants WHERE id = ANY($1::uuid[]) ORDER BY id",
    [[tenantA, tenantB]],
  );
  assert.deepEqual(
    new Set(result.rows.map((row) => row.id)),
    new Set([tenantA, tenantB]),
  );
});

test("provisioning idempotency keys are unique", async () => {
  const key = `integration-${runId}`;
  await controlQuery(
    `INSERT INTO provisioning_requests (
       idempotency_key, actor_id, request_hash, status
     ) VALUES ($1, $2, $3, 'processing')`,
    [key, actorA, `hash-${runId}`],
  );

  await assert.rejects(
    controlQuery(
      `INSERT INTO provisioning_requests (
         idempotency_key, actor_id, request_hash, status
       ) VALUES ($1, $2, $3, 'processing')`,
      [key, actorA, `other-hash-${runId}`],
    ),
    /duplicate key|unique constraint/i,
  );
});
