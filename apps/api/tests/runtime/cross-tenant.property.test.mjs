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

const app = new Pool({ connectionString: required("DATABASE_URL"), max: 4, statement_timeout: 10_000 });
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2, statement_timeout: 10_000 });
const runId = randomUUID();
const fixtures = Array.from({ length: 12 }, (_, index) => ({
  tenantId: randomUUID(),
  userId: randomUUID(),
  membershipId: randomUUID(),
  index,
}));

async function withTenant(tenantId, operation) {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.data_plane', 'application', true)");
    const result = await operation(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

test.before(async () => {
  for (const fixture of fixtures) {
    await control.query(
      `INSERT INTO users (id, identity_issuer, identity_subject, email, display_name, status)
       VALUES ($1, 'https://property.qe.invalid', $2, $3, $4, 'active')`,
      [fixture.userId, `${runId}-${fixture.index}`, `property-${runId}-${fixture.index}@example.invalid`, `Property user ${fixture.index}`],
    );
    await control.query(
      `INSERT INTO tenants (
         id, slug, display_name, legal_name, status, deployment_tier,
         residency_region, plan_key, locale, timezone, created_by
       ) VALUES ($1, $2, $3, $3, 'active', 'shared', 'af-south-1',
                 'foundation', 'en-ZA', 'Africa/Johannesburg', $4)`,
      [fixture.tenantId, `property-${runId}-${fixture.index}`, `Property tenant ${fixture.index}`, fixture.userId],
    );
    await control.query(
      `INSERT INTO memberships (id, tenant_id, user_id, status, locale, timezone)
       VALUES ($1, $2, $3, 'active', 'en-ZA', 'Africa/Johannesburg')`,
      [fixture.membershipId, fixture.tenantId, fixture.userId],
    );
  }
});

test.after(async () => Promise.all([app.end(), control.end()]));

test("every generated tenant context can observe only its own tenant and membership", async () => {
  const tenantIds = fixtures.map((fixture) => fixture.tenantId);
  const membershipIds = fixtures.map((fixture) => fixture.membershipId);
  for (const fixture of fixtures) {
    await withTenant(fixture.tenantId, async (client) => {
      const tenants = await client.query("SELECT id FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
      const memberships = await client.query("SELECT id FROM memberships WHERE id = ANY($1::uuid[])", [membershipIds]);
      assert.deepEqual(tenants.rows.map((row) => row.id), [fixture.tenantId]);
      assert.deepEqual(memberships.rows.map((row) => row.id), [fixture.membershipId]);
    });
  }
});

test("generated cross-tenant writes are denied for every adjacent tenant pair", async () => {
  for (let index = 0; index < fixtures.length; index += 1) {
    const source = fixtures[index];
    const target = fixtures[(index + 1) % fixtures.length];
    await assert.rejects(
      withTenant(source.tenantId, (client) => client.query(
        `INSERT INTO membership_invitations (
           tenant_id, email, role_key, scope_type, scope_id, status, expires_at, invited_by
         ) VALUES ($1, $2, 'learner', 'tenant', $1, 'sent', now() + interval '1 day', $3)`,
        [target.tenantId, `denied-${runId}-${index}@example.invalid`, source.userId],
      )),
      /row-level security|violates row-level security/i,
    );
  }
});
