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

const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2 });
const runId = randomUUID();
const actorId = randomUUID();
const tenantId = randomUUID();
const flagKey = `integration.mutation.${runId}`;

async function seed() {
  await control.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, status)
     VALUES ($1,'https://release-mutation.integration.invalid',$2,$3,'active')`,
    [actorId, `operator-${runId}`, `operator-${runId}@example.invalid`],
  );
  await control.query(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES ($1,$2,'Release mutation tenant','Release mutation tenant','active','shared',
               'af-south-1','foundation','en-ZA','Africa/Johannesburg',$3)`,
    [tenantId, `release-mutation-${runId}`, actorId],
  );
  await control.query(
    `INSERT INTO feature_flags (
       key, display_name, description, risk_level, lifecycle, default_enabled,
       created_by, updated_by
     ) VALUES ($1,'Mutation integration','Integration verifies versioned release governance mutations.','medium','active',false,$2,$2)`,
    [flagKey, actorId],
  );
}

test.before(seed);
test.after(async () => control.end());

test("conditional feature and ring updates reject stale versions", async () => {
  const feature = await control.query(
    `UPDATE feature_flags SET default_enabled = true, version = version + 1, updated_by = $2
     WHERE key = $1 AND version = 1 RETURNING version`,
    [flagKey, actorId],
  );
  assert.equal(feature.rows[0]?.version, 2);
  assert.equal((await control.query(
    `UPDATE feature_flags SET default_enabled = false, version = version + 1, updated_by = $2
     WHERE key = $1 AND version = 1`,
    [flagKey, actorId],
  )).rowCount, 0);

  await control.query(
    `INSERT INTO release_ring_feature_flags (
       ring_key, feature_flag_key, enabled, reason, configured_by
     ) VALUES ('design-partner',$1,true,'Integration creates the initial ring configuration.',$2)`,
    [flagKey, actorId],
  );
  assert.equal((await control.query(
    `UPDATE release_ring_feature_flags
     SET enabled = false, version = version + 1, reason = 'Integration applies the next ring configuration.', configured_by = $2
     WHERE ring_key = 'design-partner' AND feature_flag_key = $1 AND version = 1
     RETURNING version`,
    [flagKey, actorId],
  )).rows[0]?.version, 2);
  assert.equal((await control.query(
    `UPDATE release_ring_feature_flags SET enabled = true, version = version + 1
     WHERE ring_key = 'design-partner' AND feature_flag_key = $1 AND version = 1`,
    [flagKey],
  )).rowCount, 0);
});

test("tenant assignment and override records preserve independent versions", async () => {
  const assignment = await control.query(
    `INSERT INTO tenant_release_assignments (tenant_id, ring_key, reason, assigned_by)
     VALUES ($1,'preview','Integration assigns the tenant to preview for validation.',$2)
     RETURNING version`,
    [tenantId, actorId],
  );
  assert.equal(assignment.rows[0]?.version, 1);
  assert.equal((await control.query(
    `UPDATE tenant_release_assignments
     SET ring_key = 'general-availability', version = version + 1,
         reason = 'Integration advances the tenant after validation.', assigned_by = $2
     WHERE tenant_id = $1 AND version = 1 RETURNING version`,
    [tenantId, actorId],
  )).rows[0]?.version, 2);

  const override = await control.query(
    `INSERT INTO tenant_feature_flag_overrides (
       tenant_id, feature_flag_key, enabled, reason, configured_by
     ) VALUES ($1,$2,true,'Integration creates a tenant-specific capability override.',$3)
     RETURNING version`,
    [tenantId, flagKey, actorId],
  );
  assert.equal(override.rows[0]?.version, 1);
});

test("platform operation idempotency keys cannot be reused", async () => {
  const key = `release-mutation:${runId}`;
  await control.query(
    `INSERT INTO platform_operation_requests (
       idempotency_key, operation_type, actor_id, request_hash,
       status, resource_type, resource_id
     ) VALUES ($1,'feature-flag-create',$2,'hash-one','processing','feature-flag',$3)`,
    [key, actorId, flagKey],
  );
  await assert.rejects(
    control.query(
      `INSERT INTO platform_operation_requests (
         idempotency_key, operation_type, actor_id, request_hash,
         status, resource_type, resource_id
       ) VALUES ($1,'feature-flag-create',$2,'hash-two','processing','feature-flag',$3)`,
      [key, actorId, flagKey],
    ),
    /duplicate key|unique constraint/i,
  );
});
