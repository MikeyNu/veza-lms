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
const app = new Pool({ connectionString: required("DATABASE_URL"), max: 2, statement_timeout: 15_000 });
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2, statement_timeout: 15_000 });
const worker = new Pool({ connectionString: required("WORKER_DATABASE_URL"), max: 2, statement_timeout: 30_000 });

const runKey = randomUUID();
const actorA = randomUUID();
const actorB = randomUUID();
const reviewer = randomUUID();
const tenant = randomUUID();
const institution = randomUUID();
const period = randomUUID();
const learnerA = randomUUID();
const learnerB = randomUUID();
const definition = randomUUID();
const blueprint = randomUUID();
const courseRun = randomUUID();
const enrolmentA = randomUUID();
const enrolmentB = randomUUID();
const assignment = randomUUID();

async function withTenant(tenantId, callback) {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
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

test.before(async () => {
  await control.query(
    `INSERT INTO users(id,identity_issuer,identity_subject,email,display_name,status)
     VALUES ($1,'https://academic.test',$2,$3,'Learner A','active'),
            ($4,'https://academic.test',$5,$6,'Learner B','active'),
            ($7,'https://academic.test',$8,$9,'Independent reviewer','active')`,
    [
      actorA,
      `learner-a-${runKey}`,
      `learner-a-${runKey}@example.invalid`,
      actorB,
      `learner-b-${runKey}`,
      `learner-b-${runKey}@example.invalid`,
      reviewer,
      `reviewer-${runKey}`,
      `reviewer-${runKey}@example.invalid`,
    ],
  );
  await control.query(
    `INSERT INTO tenants(
       id,slug,display_name,legal_name,status,deployment_tier,residency_region,
       plan_key,locale,timezone,created_by
     ) VALUES ($1,$2,'Academic evidence tenant','Academic evidence tenant','active',
       'shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3)`,
    [tenant, `academic-${runKey}`, reviewer],
  );
  await control.query(
    `INSERT INTO institutions(
       id,tenant_id,code,display_name,institution_type,locale,timezone,status,created_by
     ) VALUES ($1,$2,'MAIN','Academic evidence institution','college',
       'en-ZA','Africa/Johannesburg','active',$3)`,
    [institution, tenant, reviewer],
  );
  await control.query(
    `INSERT INTO academic_periods(
       id,tenant_id,institution_id,code,display_name,period_type,status,
       starts_on,ends_on,timezone,created_by,published_by,published_at
     ) VALUES ($1,$2,$3,'2028','Academic year 2028','academic-year','published',
       '2028-01-01','2028-12-31','Africa/Johannesburg',$4,$4,now())`,
    [period, tenant, institution, reviewer],
  );

  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    await client.query(
      `INSERT INTO people(
         id,tenant_id,legal_given_names,legal_family_name,display_name,status,locale,
         linked_user_id,created_by,updated_by
       ) VALUES ($1,$2,'Lerato','Maseko','Lerato Maseko','active','en-ZA',$3,$4,$4),
                ($5,$2,'Thabo','Mokoena','Thabo Mokoena','active','en-ZA',$6,$4,$4)`,
      [learnerA, tenant, actorA, reviewer, learnerB, actorB],
    );
    await client.query(
      `INSERT INTO learner_profiles(person_id,tenant_id,institution_id,status)
       VALUES ($1,$2,$3,'active'),($4,$2,$3,'active')`,
      [learnerA, tenant, institution, learnerB],
    );
    await client.query(
      `INSERT INTO course_definitions(id,tenant_id,institution_id,code,title,created_by)
       VALUES ($1,$2,$3,'SEC.01','Evidence security',$4)`,
      [definition, tenant, institution, reviewer],
    );
    await client.query(
      `INSERT INTO course_blueprint_versions(
         id,tenant_id,institution_id,course_definition_id,version_number,lifecycle,
         title,description,effective_from,approved_by,approved_at,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,1,'approved','Evidence security',
         'Approved evidence security blueprint.','2028-01-01',$5,now(),$5,$5)`,
      [blueprint, tenant, institution, definition, reviewer],
    );
    await client.query(
      `INSERT INTO course_runs(
         id,tenant_id,institution_id,academic_period_id,course_blueprint_version_id,
         code,title,delivery_mode,starts_on,ends_on,lifecycle,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,'SEC.RUN','Evidence security 2028','online',
         '2028-02-01','2028-06-30','open',$6,$6)`,
      [courseRun, tenant, institution, period, blueprint, reviewer],
    );
    await client.query(
      `INSERT INTO enrolments(
         id,tenant_id,institution_id,learner_person_id,course_run_id,status,
         enrolled_on,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,$5,'active','2028-01-20',$6,$6),
                ($7,$2,$3,$8,$5,'active','2028-01-20',$6,$6)`,
      [enrolmentA, tenant, institution, learnerA, courseRun, reviewer, enrolmentB, learnerB],
    );
    await client.query(
      `INSERT INTO assignments(
         id,tenant_id,institution_id,course_run_id,title,instructions,due_at,
         group_mode,allowed_formats,max_attempts,status,created_by,updated_by
       ) VALUES ($1,$2,$3,$4,'Evidence task','{"blocks":[]}'::jsonb,
         '2028-04-01T12:00:00Z','individual',ARRAY['text','file'],3,'published',$5,$5)`,
      [assignment, tenant, institution, courseRun, reviewer],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test.after(async () => {
  await Promise.all([app.end(), control.end(), worker.end()]);
});

test("submission ownership functions reject another learner identity", async () => {
  await withTenant(tenant, async (client) => {
    const owned = await client.query(
      "SELECT app.require_owned_enrolment($1,$2) learner_person_id",
      [enrolmentA, actorA],
    );
    assert.equal(owned.rows[0].learner_person_id, learnerA);
    await assert.rejects(
      client.query("SELECT app.require_owned_enrolment($1,$2)", [enrolmentA, actorB]),
      /does not belong/i,
    );

    const attempt = randomUUID();
    const file = randomUUID();
    await client.query(
      `INSERT INTO submission_attempts(
         id,tenant_id,institution_id,assignment_id,enrolment_id,learner_person_id,attempt_number
       ) VALUES ($1,$2,$3,$4,$5,$6,1)`,
      [attempt, tenant, institution, assignment, enrolmentA, learnerA],
    );
    await client.query(
      `INSERT INTO submission_files(
         id,tenant_id,submission_attempt_id,file_name,object_key,media_type,
         byte_size,checksum,upload_session_id,upload_offset
       ) VALUES ($1,$2,$3,'answer.pdf','submissions/answer.pdf','application/pdf',
         10,$4,'session-owned',0)`,
      [file, tenant, attempt, "a".repeat(64)],
    );
    const attemptOwner = await client.query(
      "SELECT app.require_owned_submission_attempt($1,$2) learner_person_id",
      [attempt, actorA],
    );
    assert.equal(attemptOwner.rows[0].learner_person_id, learnerA);
    await assert.rejects(
      client.query("SELECT app.require_owned_submission_attempt($1,$2)", [attempt, actorB]),
      /does not belong/i,
    );
    await assert.rejects(
      client.query("SELECT app.require_owned_submission_file($1,$2)", [file, actorB]),
      /does not belong/i,
    );
  });
});

test("rubric and certificate approvals require independent evidence and become immutable", async () => {
  await withTenant(tenant, async (client) => {
    const rubric = randomUUID();
    const criterion = randomUUID();
    await client.query(
      `INSERT INTO rubrics(
         id,tenant_id,institution_id,title,status,version,created_by,updated_by
       ) VALUES ($1,$2,$3,'Evidence rubric','draft',1,$4,$4)`,
      [rubric, tenant, institution, actorA],
    );
    await client.query(
      `INSERT INTO rubric_criteria(
         tenant_id,rubric_id,criterion_id,sequence_number,title,maximum_score,levels
       ) VALUES ($1,$2,$3,1,'Accuracy',100,'[{"label":"Complete"}]'::jsonb)`,
      [tenant, rubric, criterion],
    );
    await client.query(
      `UPDATE rubrics SET status='in_review',submitted_by=$2,submitted_at=now(),
         version=2,updated_by=$2 WHERE id=$1`,
      [rubric, actorA],
    );
    await assert.rejects(
      client.query(
        `INSERT INTO rubric_criteria(
           tenant_id,rubric_id,criterion_id,sequence_number,title,maximum_score,levels
         ) VALUES ($1,$2,$3,2,'Late addition',10,'[{"label":"Added"}]'::jsonb)`,
        [tenant, rubric, randomUUID()],
      ),
      /immutable/i,
    );
    await assert.rejects(
      client.query(
        `UPDATE rubrics SET status='approved',approved_by=$2,approved_at=now(),
           approval_notes='Self approval is prohibited',version=3 WHERE id=$1`,
        [rubric, actorA],
      ),
      /approval|constraint/i,
    );
    await client.query(
      `UPDATE rubrics SET status='approved',approved_by=$2,approved_at=now(),
         approval_notes='Independent approval completed',version=3,updated_by=$2 WHERE id=$1`,
      [rubric, reviewer],
    );
    await assert.rejects(
      client.query("UPDATE rubrics SET title='Changed approved rubric' WHERE id=$1", [rubric]),
      /immutable/i,
    );

    const template = randomUUID();
    await client.query(
      `INSERT INTO certificate_templates(
         id,tenant_id,institution_id,title,document_schema,status,version,created_by,updated_by
       ) VALUES ($1,$2,$3,'Completion certificate','{"layout":"formal"}'::jsonb,
         'draft',1,$4,$4)`,
      [template, tenant, institution, actorA],
    );
    await client.query(
      `UPDATE certificate_templates SET status='in_review',submitted_by=$2,
         submitted_at=now(),version=2,updated_by=$2 WHERE id=$1`,
      [template, actorA],
    );
    await client.query(
      `UPDATE certificate_templates SET status='approved',approved_by=$2,
         approved_at=now(),approval_notes='Independent template approval',
         version=3,updated_by=$2 WHERE id=$1`,
      [template, reviewer],
    );
    await assert.rejects(
      client.query(
        "UPDATE certificate_templates SET document_schema='{}'::jsonb WHERE id=$1",
        [template],
      ),
      /immutable/i,
    );
  });
});

test("publishing a corrected grade supersedes every prior current result", async () => {
  await withTenant(tenant, async (client) => {
    const item = randomUUID();
    const draft = randomUUID();
    const published = randomUUID();
    await client.query(
      `INSERT INTO gradebook_items(
         id,tenant_id,institution_id,course_run_id,title,maximum_score,status
       ) VALUES ($1,$2,$3,$4,'Evidence task',100,'active')`,
      [item, tenant, institution, courseRun],
    );
    await client.query(
      `INSERT INTO learner_grade_results(
         id,tenant_id,enrolment_id,gradebook_item_id,raw_score,calculated_score,
         state,version,created_by
       ) VALUES ($1,$2,$3,$4,50,50,'draft',1,$5)`,
      [draft, tenant, enrolmentA, item, reviewer],
    );
    await client.query(
      `INSERT INTO learner_grade_results(
         id,tenant_id,enrolment_id,gradebook_item_id,raw_score,calculated_score,
         state,version,created_by,published_at
       ) VALUES ($1,$2,$3,$4,75,75,'published',1,$5,now())`,
      [published, tenant, enrolmentA, item, reviewer],
    );
    const results = await client.query(
      `SELECT id,state,supersedes_result_id FROM learner_grade_results
       WHERE enrolment_id=$1 AND gradebook_item_id=$2 ORDER BY created_at,id`,
      [enrolmentA, item],
    );
    assert.equal(results.rows.find((row) => row.id === draft).state, "corrected");
    assert.equal(results.rows.find((row) => row.id === published).state, "published");
    assert.equal(results.rows.find((row) => row.id === published).supersedes_result_id, draft);
  });
});

test("worker refresh records freshness-aware metric execution", async () => {
  const result = await worker.query(
    "SELECT app.refresh_due_core_metrics($1,10) refreshed",
    [`integration-${runKey}`],
  );
  assert.ok(Number(result.rows[0].refreshed) >= 1);
  const runs = await control.query(
    "SELECT status,metric_count FROM metric_refresh_runs WHERE institution_id=$1 ORDER BY started_at DESC LIMIT 1",
    [institution],
  );
  assert.equal(runs.rows[0].status, "completed");
  assert.equal(Number(runs.rows[0].metric_count), 5);
});
