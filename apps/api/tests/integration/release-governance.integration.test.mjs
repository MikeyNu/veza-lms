import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
const { Pool } = pg;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const app = new Pool({ connectionString: required("DATABASE_URL"), max: 2 });
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2 });
const runId = randomUUID();
const actorId = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();
const keys = {
  defaultOn: `integration.default-on.${runId}`,
  ringOnly: `integration.ring-only.${runId}`,
  studio: `integration.studio.${runId}`,
};

async function withTenant(tenantId, work) {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
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
  await control.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, status)
     VALUES ($1,'https://release.integration.invalid',$2,$3,'active')`,
    [actorId, `operator-${runId}`, `operator-${runId}@example.invalid`],
  );
  await control.query(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES
       ($1,$2,'Release tenant A','Release tenant A','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$5),
       ($3,$4,'Release tenant B','Release tenant B','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$5)`,
    [tenantA, `release-a-${runId}`, tenantB, `release-b-${runId}`, actorId],
  );
  await control.query(
    `INSERT INTO tenant_entitlements (tenant_id, module_key, state)
     VALUES ($1,'core','enabled'), ($2,'core','enabled'), ($2,'studio-pro','enabled')`,
    [tenantA, tenantB],
  );
  await control.query(
    `INSERT INTO feature_flags (
       key, display_name, description, risk_level, lifecycle, default_enabled,
       required_module_key, created_by, updated_by
     ) VALUES
       ($1,'Default on','Integration flag enabled by its default configuration.','low','active',true,NULL,$4,$4),
       ($2,'Ring only','Integration flag enabled only in the design-partner ring.','medium','active',false,NULL,$4,$4),
       ($3,'Studio gated','Integration flag requiring the Studio Pro entitlement.','high','active',true,'studio-pro',$4,$4)`,
    [keys.defaultOn, keys.ringOnly, keys.studio, actorId],
  );
  await control.query(
    `INSERT INTO tenant_release_assignments (tenant_id, ring_key, reason, assigned_by)
     VALUES ($1,'design-partner','Integration verifies release-ring precedence for this tenant.',$2)`,
    [tenantA, actorId],
  );
  await control.query(
    `INSERT INTO release_ring_feature_flags (ring_key, feature_flag_key, enabled, reason, configured_by)
     VALUES ('design-partner',$1,true,'Integration enables this capability for the design-partner ring.',$2)`,
    [keys.ringOnly, actorId],
  );
  await control.query(
    `INSERT INTO tenant_feature_flag_overrides (tenant_id, feature_flag_key, enabled, reason, configured_by)
     VALUES ($1,$2,false,'Integration verifies tenant override precedence over the default.',$3)`,
    [tenantA, keys.defaultOn, actorId],
  );
});

test.after(async () => {
  await Promise.all([app.end(), control.end()]);
});

test("evaluation fails closed when tenant context is absent", async () => {
  const result = await app.query("SELECT * FROM app.current_feature_flags()");
  assert.equal(result.rowCount, 0);
});

test("tenant override, release ring and entitlement precedence are deterministic", async () => {
  await withTenant(tenantA, async (client) => {
    const result = await client.query(
      "SELECT flag_key, enabled, source, ring_key FROM app.current_feature_flags() WHERE flag_key = ANY($1::text[]) ORDER BY flag_key",
      [[keys.defaultOn, keys.ringOnly, keys.studio]],
    );
    const byKey = new Map(result.rows.map((row) => [row.flag_key, row]));
    assert.deepEqual(
      { enabled: byKey.get(keys.defaultOn)?.enabled, source: byKey.get(keys.defaultOn)?.source },
      { enabled: false, source: "tenant-override" },
    );
    assert.deepEqual(
      { enabled: byKey.get(keys.ringOnly)?.enabled, source: byKey.get(keys.ringOnly)?.source, ring: byKey.get(keys.ringOnly)?.ring_key },
      { enabled: true, source: "release-ring", ring: "design-partner" },
    );
    assert.deepEqual(
      { enabled: byKey.get(keys.studio)?.enabled, source: byKey.get(keys.studio)?.source },
      { enabled: false, source: "entitlement" },
    );
  });
});

test("general-availability fallback still respects an enabled entitlement", async () => {
  await withTenant(tenantB, async (client) => {
    const result = await client.query(
      "SELECT flag_key, enabled, source, ring_key FROM app.current_feature_flags() WHERE flag_key = ANY($1::text[]) ORDER BY flag_key",
      [[keys.defaultOn, keys.ringOnly, keys.studio]],
    );
    const byKey = new Map(result.rows.map((row) => [row.flag_key, row]));
    assert.equal(byKey.get(keys.defaultOn)?.enabled, true);
    assert.equal(byKey.get(keys.defaultOn)?.source, "default");
    assert.equal(byKey.get(keys.ringOnly)?.enabled, false);
    assert.equal(byKey.get(keys.studio)?.enabled, true);
    assert.equal(byKey.get(keys.studio)?.ring_key, "general-availability");
  });
});

test("application identity has no direct access to release-governance tables", async () => {
  await assert.rejects(app.query("SELECT key FROM feature_flags LIMIT 1"), /permission denied/i);
  await assert.rejects(app.query("SELECT key FROM release_rings LIMIT 1"), /permission denied/i);
  await assert.rejects(app.query("SELECT tenant_id FROM tenant_release_assignments LIMIT 1"), /permission denied/i);
});
