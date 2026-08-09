import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const app = new Pool({ connectionString: required("DATABASE_URL"), max: 2 });
const control = new Pool({
  connectionString: required("CONTROL_PLANE_DATABASE_URL"),
  max: 2,
});
const run = randomUUID();
const actor = randomUUID();
const tenant = randomUUID();
const otherTenant = randomUUID();
const institution = randomUUID();
const otherInstitution = randomUUID();
async function withTenant(id, callback, commit = false) {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [id]);
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
  await control.query(
    "INSERT INTO users (id,identity_issuer,identity_subject,email,display_name,status) VALUES ($1,'https://people.test',$2,$3,'People operator','active')",
    [actor, `people-${run}`, `people-${run}@example.invalid`],
  );
  await control.query(
    "INSERT INTO tenants (id,slug,display_name,legal_name,status,deployment_tier,residency_region,plan_key,locale,timezone,created_by) VALUES ($1,$2,'People tenant','People tenant','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3),($4,$5,'Other tenant','Other tenant','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3)",
    [tenant, `people-${run}`, actor, otherTenant, `people-other-${run}`],
  );
  await withTenant(
    tenant,
    (client) =>
      client.query(
        "INSERT INTO institutions (id,tenant_id,code,display_name,institution_type,locale,timezone,status,created_by) VALUES ($1,$2,'MAIN','Main institution','college','en-ZA','Africa/Johannesburg','active',$3)",
        [institution, tenant, actor],
      ),
    true,
  );
  await withTenant(
    otherTenant,
    (client) =>
      client.query(
        "INSERT INTO institutions (id,tenant_id,code,display_name,institution_type,locale,timezone,status,created_by) VALUES ($1,$2,'OTHER','Other institution','college','en-ZA','Africa/Johannesburg','active',$3)",
        [otherInstitution, otherTenant, actor],
      ),
    true,
  );
});
test.after(async () => {
  await Promise.all([app.end(), control.end()]);
});

test("people, profiles, relationships and imports are tenant isolated", async () => {
  const person = randomUUID();
  const guardian = randomUUID();
  await withTenant(tenant, async (client) => {
    await client.query(
      "INSERT INTO people (id,tenant_id,legal_given_names,legal_family_name,status,locale,created_by,updated_by) VALUES ($1,$2,'Lerato','Mokoena','active','en-ZA',$3,$3),($4,$2,'Thandi','Mokoena','active','en-ZA',$3,$3)",
      [person, tenant, actor, guardian],
    );
    await client.query(
      "INSERT INTO learner_profiles (person_id,tenant_id,institution_id,status) VALUES ($1,$2,$3,'active')",
      [person, tenant, institution],
    );
    await client.query(
      "INSERT INTO person_relationships (id,tenant_id,subject_person_id,related_person_id,institution_id,relationship_type,authority,valid_from,created_by) VALUES ($1,$2,$3,$4,$5,'guardian',$6,current_date,$7)",
      [
        randomUUID(),
        tenant,
        person,
        guardian,
        institution,
        { canAccessRecords: true },
        actor,
      ],
    );
    const batch = randomUUID();
    await client.query(
      "INSERT INTO people_imports (id,tenant_id,institution_id,source_filename,source_checksum,status,total_rows,created_by) VALUES ($1,$2,$3,'people.csv',$4,'ready',1,$5)",
      [batch, tenant, institution, "a".repeat(64), actor],
    );
    const visible = await client.query(
      "SELECT p.id,l.status FROM people p LEFT JOIN learner_profiles l ON l.person_id=p.id ORDER BY p.id",
    );
    assert.equal(visible.rowCount, 2);
    await assert.rejects(
      client.query(
        "INSERT INTO learner_profiles (person_id,tenant_id,institution_id,status) VALUES ($1,$2,$3,'active')",
        [guardian, tenant, otherInstitution],
      ),
      /same tenant|cross-tenant reference|violates|foreign key/i,
    );
  });
  await withTenant(otherTenant, async (client) => {
    const rows = await client.query(
      "SELECT id FROM people WHERE id=ANY($1::uuid[])",
      [[person, guardian]],
    );
    assert.equal(rows.rowCount, 0);
  });
});

test("optimistic person version advances exactly once", async () => {
  const id = randomUUID();
  await withTenant(tenant, async (client) => {
    await client.query(
      "INSERT INTO people (id,tenant_id,legal_given_names,legal_family_name,status,locale,created_by,updated_by) VALUES ($1,$2,'Neo','Dube','active','en-ZA',$3,$3)",
      [id, tenant, actor],
    );
    const first = await client.query(
      "UPDATE people SET preferred_name='N',version=version+1 WHERE id=$1 AND version=1 RETURNING version",
      [id],
    );
    assert.equal(first.rows[0].version, 2);
    const stale = await client.query(
      "UPDATE people SET preferred_name='Stale',version=version+1 WHERE id=$1 AND version=1 RETURNING version",
      [id],
    );
    assert.equal(stale.rowCount, 0);
  });
});
