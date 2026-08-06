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

const app = new Pool({ connectionString: required("DATABASE_URL"), max: 2, statement_timeout: 20_000 });
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 2, statement_timeout: 20_000 });
const worker = new Pool({ connectionString: required("WORKER_DATABASE_URL"), max: 2, statement_timeout: 30_000 });

const runKey = randomUUID();
const actor = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();
const institutionA = randomUUID();
const institutionB = randomUUID();
const personA = randomUUID();
const exportReady = randomUUID();
const exportFailed = randomUUID();
const exportMalformed = randomUUID();

async function withTenant(pool, tenantId, callback, commit = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
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

async function claim(exportId, workerId) {
  const result = await worker.query(
    "SELECT * FROM app.claim_export_jobs($1,100,60)",
    [workerId],
  );
  const job = result.rows.find((row) => row.id === exportId);
  assert.ok(job, `Expected export ${exportId} to be claimed`);
  return job;
}

test.before(async () => {
  await control.query(
    `INSERT INTO users(id,identity_issuer,identity_subject,email,display_name,status)
     VALUES ($1,'https://exports.test',$2,$3,'Export Operator','active')`,
    [actor, `export-${runKey}`, `export-${runKey}@example.invalid`],
  );
  await control.query(
    `INSERT INTO tenants(
       id,slug,display_name,legal_name,status,deployment_tier,residency_region,
       plan_key,locale,timezone,created_by
     ) VALUES
       ($1,$2,'Export Tenant A','Export Tenant A','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3),
       ($4,$5,'Export Tenant B','Export Tenant B','active','shared','af-south-1','foundation','en-ZA','Africa/Johannesburg',$3)`,
    [tenantA, `export-a-${runKey}`, actor, tenantB, `export-b-${runKey}`],
  );
  await control.query(
    `INSERT INTO institutions(
       id,tenant_id,code,display_name,institution_type,locale,timezone,status,created_by
     ) VALUES
       ($1,$2,'MAIN','Export Institution A','college','en-ZA','Africa/Johannesburg','active',$3),
       ($4,$5,'MAIN','Export Institution B','college','en-ZA','Africa/Johannesburg','active',$3)`,
    [institutionA, tenantA, actor, institutionB, tenantB],
  );
  await withTenant(app, tenantA, async (client) => {
    await client.query(
      `INSERT INTO people(
         id,tenant_id,preferred_name,legal_given_names,legal_family_name,status,locale,created_by,updated_by
       ) VALUES ($1,$2,'Naledi','Naledi','Mokoena','active','en-ZA',$3,$3)`,
      [personA, tenantA, actor],
    );
    await client.query(
      `INSERT INTO learner_profiles(person_id,tenant_id,institution_id,status)
       VALUES ($1,$2,$3,'active')`,
      [personA, tenantA, institutionA],
    );
    await client.query(
      `INSERT INTO export_jobs(
         id,tenant_id,institution_id,export_type,format,filters,status,requested_by
       ) VALUES ($1,$2,$3,'people','pdf','{}'::jsonb,'requested',$4)`,
      [exportReady, tenantA, institutionA, actor],
    );
  }, true);
});

test.after(async () => {
  await Promise.all([app.end(), control.end(), worker.end()]);
});

test("application RLS hides a requested export from another tenant", async () => {
  await withTenant(app, tenantB, async (client) => {
    const result = await client.query("SELECT id FROM export_jobs WHERE id=$1", [exportReady]);
    assert.equal(result.rowCount, 0);
  });
});

test("worker claim and payload generation remain tenant scoped", async () => {
  const job = await claim(exportReady, `export-worker-${runKey}`);
  assert.equal(job.tenant_id, tenantA);
  assert.equal(job.format, "pdf");
  assert.equal(job.attempts, 1);

  const result = await worker.query(
    "SELECT app.export_document_payload($1) payload",
    [exportReady],
  );
  const payload = result.rows[0].payload;
  assert.equal(payload.exportId, exportReady);
  assert.equal(payload.tenantName, "Export Tenant A");
  assert.equal(payload.institutionName, "Export Institution A");
  assert.deepEqual(payload.columns, ["personId", "preferredName", "legalGivenNames", "legalFamilyName", "status", "locale"]);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].personId, personA);
  assert.equal(payload.rows[0].legalFamilyName, "Mokoena");
});

test("worker completion creates ready state, audit evidence and outbox evidence", async () => {
  const checksum = "a".repeat(64);
  const result = await worker.query(
    `SELECT app.complete_export_job($1,$2,1,$3,$4,1,now()+interval '1 hour') completed`,
    [exportReady, `export-worker-${runKey}`, `exports/${tenantA}/people/${exportReady}.pdf`, checksum],
  );
  assert.equal(result.rows[0].completed, true);

  await withTenant(app, tenantA, async (client) => {
    const job = await client.query(
      `SELECT status,format,checksum,row_count::text,ready_at,expires_at,lease_owner
       FROM export_jobs WHERE id=$1`,
      [exportReady],
    );
    assert.equal(job.rows[0].status, "ready");
    assert.equal(job.rows[0].format, "pdf");
    assert.equal(job.rows[0].checksum, checksum);
    assert.equal(job.rows[0].row_count, "1");
    assert.equal(job.rows[0].lease_owner, null);
    assert.ok(job.rows[0].ready_at);
    assert.ok(job.rows[0].expires_at);

    const audit = await client.query(
      `SELECT event_type,after_state FROM audit_events
       WHERE resource_type='export-job' AND resource_id=$1`,
      [exportReady],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].event_type, "export.ready");
    assert.equal(audit.rows[0].after_state.checksum, checksum);

    const outbox = await client.query(
      `SELECT event_name,payload FROM outbox_events
       WHERE aggregate_type='export-job' AND aggregate_id=$1`,
      [exportReady],
    );
    assert.equal(outbox.rowCount, 1);
    assert.equal(outbox.rows[0].event_name, "export.ready");
    assert.equal(outbox.rows[0].payload.rowCount, 1);
  });
});

test("terminal worker failure records durable failure evidence", async () => {
  await withTenant(app, tenantA, async (client) => {
    await client.query(
      `INSERT INTO export_jobs(
         id,tenant_id,institution_id,export_type,format,filters,status,requested_by,maximum_attempts
       ) VALUES ($1,$2,$3,'people','json','{}'::jsonb,'requested',$4,1)`,
      [exportFailed, tenantA, institutionA, actor],
    );
  }, true);
  await claim(exportFailed, `failure-worker-${runKey}`);
  const result = await worker.query(
    `SELECT app.fail_export_job($1,$2,1,'object storage unavailable',now()+interval '5 minutes') failed`,
    [exportFailed, `failure-worker-${runKey}`],
  );
  assert.equal(result.rows[0].failed, true);

  await withTenant(app, tenantA, async (client) => {
    const job = await client.query("SELECT status,failure_reason FROM export_jobs WHERE id=$1", [exportFailed]);
    assert.equal(job.rows[0].status, "failed");
    assert.equal(job.rows[0].failure_reason, "object storage unavailable");
    const audit = await client.query(
      "SELECT event_type FROM audit_events WHERE resource_type='export-job' AND resource_id=$1",
      [exportFailed],
    );
    assert.equal(audit.rows[0].event_type, "export.failed");
  });
});

test("malformed filter values are rejected before queueing", async () => {
  await withTenant(app, tenantA, async (client) => {
    await assert.rejects(
      client.query(
        `INSERT INTO export_jobs(
           id,tenant_id,institution_id,export_type,format,filters,status,requested_by
         ) VALUES ($1,$2,$3,'gradebook','pdf',$4::jsonb,'requested',$5)`,
        [exportMalformed, tenantA, institutionA, JSON.stringify({ includeCorrected: "yes" }), actor],
      ),
      /export_jobs_filter_contract_check/i,
    );
  });
});

test("platform schedules reconcile with explicit ownership and expiry ready exports", async () => {
  const reconciled = await worker.query("SELECT app.ensure_platform_schedules() result");
  assert.ok(Number(reconciled.rows[0].result.globalSchedules) >= 9);
  assert.ok(Number(reconciled.rows[0].result.tenantSchedules) >= 2);

  const globalSchedules = await worker.query(
    `SELECT job_key,handler_key,created_by,created_source
     FROM scheduled_jobs WHERE tenant_id IS NULL ORDER BY job_key`,
  );
  const expectedGlobalJobs = [
    "api.runtime-cleanup",
    "api.webhook-reconciliation",
    "commercial.effective-date-sweep",
    "communications.digest-preparation",
    "exports.expiry",
    "media.retention-reconciliation",
    "observability.alert-evaluation",
    "observability.slo-measurement",
    "support.session-expiry",
  ];
  for (const jobKey of expectedGlobalJobs) {
    const schedule = globalSchedules.rows.find((row) => row.job_key === jobKey);
    assert.ok(schedule, `Expected global schedule ${jobKey}`);
    assert.equal(schedule.handler_key, jobKey);
    assert.equal(schedule.created_source, "system");
    assert.equal(schedule.created_by, null);
  }

  const tenantSchedules = await worker.query(
    `SELECT tenant_id,job_key,created_by,created_source
     FROM scheduled_jobs
     WHERE tenant_id IN ($1,$2) AND job_key='search.projection-reconciliation'
     ORDER BY tenant_id`,
    [tenantA, tenantB],
  );
  assert.equal(tenantSchedules.rowCount, 2);
  for (const schedule of tenantSchedules.rows) {
    assert.equal(schedule.created_source, "user");
    assert.equal(schedule.created_by, actor);
  }

  await withTenant(app, tenantA, async (client) => {
    await client.query("UPDATE export_jobs SET expires_at=now()-interval '1 second' WHERE id=$1", [exportReady]);
  }, true);
  const expired = await worker.query("SELECT app.expire_export_jobs() expired");
  assert.ok(Number(expired.rows[0].expired) >= 1);
  await withTenant(app, tenantA, async (client) => {
    const result = await client.query("SELECT status FROM export_jobs WHERE id=$1", [exportReady]);
    assert.equal(result.rows[0].status, "expired");
  });
});
