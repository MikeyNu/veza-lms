import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const app = new Pool({ connectionString: required("DATABASE_URL"), max: 2, statement_timeout: 10_000 });
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2, statement_timeout: 10_000 });
const runId = randomUUID();
const actor = randomUUID();
const tenant = randomUUID();
const otherTenant = randomUUID();
const institution = randomUUID();
const otherInstitution = randomUUID();
const period = randomUUID();
const learner = randomUUID();

async function withTenant(tenantId, callback) {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const value = await callback(client);
    await client.query("ROLLBACK");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

test.before(async () => {
  await control.query(
    "INSERT INTO users (id,identity_issuer,identity_subject,email,display_name,status) VALUES ($1,'https://catalogue.test',$2,$3,'Catalogue operator','active')",
    [actor, `catalogue-${runId}`, `catalogue-${runId}@example.invalid`],
  );
  await control.query(
    `INSERT INTO tenants (id,slug,display_name,legal_name,status,deployment_tier,residency_region,plan_key,locale,timezone,created_by)
     VALUES ($1,$2,'Catalogue tenant','Catalogue tenant','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3),
            ($4,$5,'Other catalogue tenant','Other catalogue tenant','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3)`,
    [tenant, `catalogue-${runId}`, actor, otherTenant, `catalogue-other-${runId}`],
  );
  await control.query(
    `INSERT INTO institutions (id,tenant_id,code,display_name,institution_type,locale,timezone,status,created_by)
     VALUES ($1,$2,'MAIN','Main institution','college','en-ZA','Africa/Johannesburg','active',$3),
            ($4,$5,'OTHER','Other institution','college','en-ZA','Africa/Johannesburg','active',$3)`,
    [institution, tenant, actor, otherInstitution, otherTenant],
  );
  await control.query(
    `INSERT INTO academic_periods (
       id,tenant_id,institution_id,code,display_name,period_type,status,starts_on,ends_on,timezone,created_by,published_by,published_at
     ) VALUES ($1,$2,$3,'2027','Academic year 2027','academic-year','published','2027-01-01','2027-12-31','Africa/Johannesburg',$4,$4,now())`,
    [period, tenant, institution, actor],
  );
});

test.after(async () => { await Promise.all([app.end(), control.end()]); });

test("approved blueprints are immutable and can create bounded delivery runs", async () => {
  await withTenant(tenant, async (client) => {
    const outcome = randomUUID();
    const definition = randomUUID();
    const blueprint = randomUUID();
    const courseRun = randomUUID();
    await client.query(
      `INSERT INTO learning_outcomes (id,tenant_id,institution_id,code,title,description,outcome_type,created_by,updated_by)
       VALUES ($1,$2,$3,'OUT.01','Apply core methods','Learner applies the approved core methods.','skill',$4,$4)`,
      [outcome, tenant, institution, actor],
    );
    await client.query(
      `INSERT INTO course_definitions (id,tenant_id,institution_id,code,title,created_by)
       VALUES ($1,$2,$3,'CRS.01','Core methods',$4)`,
      [definition, tenant, institution, actor],
    );
    await client.query(
      `INSERT INTO course_blueprint_versions (
         id,tenant_id,institution_id,course_definition_id,version_number,lifecycle,title,description,
         delivery_modes,effective_from,approved_by,approved_at,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,1,'approved','Core methods','Approved core methods blueprint.',ARRAY['blended'],'2027-01-01',$5,now(),$5,$5)`,
      [blueprint, tenant, institution, definition, actor],
    );
    await assert.rejects(
      client.query("UPDATE course_blueprint_versions SET delivery_modes=ARRAY['online'] WHERE id=$1", [blueprint]),
      /immutable/i,
    );
    await client.query(
      `INSERT INTO course_runs (
         id,tenant_id,institution_id,academic_period_id,course_blueprint_version_id,code,title,
         delivery_mode,starts_on,ends_on,lifecycle,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,'RUN.01','Core methods 2027','blended','2027-02-01','2027-05-30','open',$6,$6)`,
      [courseRun, tenant, institution, period, blueprint, actor],
    );
    const visible = await client.query("SELECT id FROM course_runs WHERE id=$1", [courseRun]);
    assert.equal(visible.rowCount, 1);
  });
});

test("enrolment creation automatically records timeline evidence", async () => {
  await withTenant(tenant, async (client) => {
    const definition = randomUUID();
    const blueprint = randomUUID();
    const courseRun = randomUUID();
    const enrolment = randomUUID();
    await client.query(
      "INSERT INTO people (id,tenant_id,legal_given_names,legal_family_name,status,locale,created_by,updated_by) VALUES ($1,$2,'Lerato','Maseko','active','en-ZA',$3,$3)",
      [learner, tenant, actor],
    );
    await client.query(
      "INSERT INTO learner_profiles (person_id,tenant_id,institution_id,status) VALUES ($1,$2,$3,'active')",
      [learner, tenant, institution],
    );
    await client.query(
      "INSERT INTO course_definitions (id,tenant_id,institution_id,code,title,created_by) VALUES ($1,$2,$3,'CRS.02','Applied practice',$4)",
      [definition, tenant, institution, actor],
    );
    await client.query(
      `INSERT INTO course_blueprint_versions (
         id,tenant_id,institution_id,course_definition_id,version_number,lifecycle,title,description,
         effective_from,approved_by,approved_at,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,1,'approved','Applied practice','Approved applied practice blueprint.','2027-01-01',$5,now(),$5,$5)`,
      [blueprint, tenant, institution, definition, actor],
    );
    await client.query(
      `INSERT INTO course_runs (
         id,tenant_id,institution_id,academic_period_id,course_blueprint_version_id,code,title,
         delivery_mode,starts_on,ends_on,lifecycle,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,'RUN.02','Applied practice 2027','in_person','2027-03-01','2027-06-30','open',$6,$6)`,
      [courseRun, tenant, institution, period, blueprint, actor],
    );
    await client.query(
      `INSERT INTO enrolments (
         id,tenant_id,institution_id,learner_person_id,course_run_id,status,enrolled_on,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,'active','2027-02-15',$6,$6)`,
      [enrolment, tenant, institution, learner, courseRun, actor],
    );
    const timeline = await client.query(
      "SELECT from_status,to_status,reason FROM enrolment_transitions WHERE enrolment_id=$1",
      [enrolment],
    );
    assert.equal(timeline.rowCount, 1);
    assert.equal(timeline.rows[0].from_status, null);
    assert.equal(timeline.rows[0].to_status, "active");
    assert.match(timeline.rows[0].reason, /institution enrolment workflow/i);
  });
});

test("catalogue and enrolment rows remain invisible to another tenant", async () => {
  await withTenant(otherTenant, async (client) => {
    const rows = await client.query("SELECT id FROM learning_outcomes UNION ALL SELECT id FROM course_runs UNION ALL SELECT id FROM enrolments");
    assert.equal(rows.rowCount, 0);
  });
});
