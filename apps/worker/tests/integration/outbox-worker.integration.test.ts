import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ConsumerRepository } from "../../src/consumer-repository.js";
import { ConsumerRuntime } from "../../src/consumer-runtime.js";
import { OutboxRepository } from "../../src/outbox-repository.js";
import { WorkerScheduler } from "../../src/scheduler.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL") });
const workerPool = new Pool({ connectionString: required("WORKER_DATABASE_URL") });
const runId = randomUUID();
const actorId = randomUUID();
const tenantId = randomUUID();

async function seedEvent(eventId: string): Promise<void> {
  await control.query(
    `INSERT INTO outbox_events (
       id, tenant_id, event_name, event_version, aggregate_type, aggregate_id,
       aggregate_version, actor_id, correlation_id, payload, occurred_at, next_attempt_at
     ) VALUES ($1,$2,'integration.outbox',1,'tenant',$2::text,1,$3,$4,'{}'::jsonb,now(),now())`,
    [eventId, tenantId, actorId, `worker-integration-${runId}`],
  );
}

test.before(async () => {
  await control.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, status)
     VALUES ($1,'https://worker.integration.invalid',$2,$3,'active')`,
    [actorId, `worker-${runId}`, `worker-${runId}@example.invalid`],
  );
  await control.query(
    `INSERT INTO tenants (
       id, slug, display_name, legal_name, status, deployment_tier,
       residency_region, plan_key, locale, timezone, created_by
     ) VALUES ($1,$2,'Worker integration','Worker integration','active','shared',
               'af-south-1','foundation','en-ZA','Africa/Johannesburg',$3)`,
    [tenantId, `worker-${runId}`, actorId],
  );
});

test.after(async () => {
  await Promise.all([control.end(), workerPool.end()]);
});

test("worker identity cannot inspect tenant or identity directories", async () => {
  await assert.rejects(workerPool.query("SELECT id FROM users LIMIT 1"), /permission denied/i);
  await assert.rejects(workerPool.query("SELECT id FROM tenants LIMIT 1"), /permission denied/i);
});

test("leases prevent concurrent claims and transport acknowledgement records evidence", async () => {
  const eventId = randomUUID();
  await seedEvent(eventId);
  const first = new OutboxRepository(workerPool);
  const secondPool = new Pool({ connectionString: required("WORKER_DATABASE_URL") });
  const second = new OutboxRepository(secondPool);
  try {
    const claimed = await first.claim(`first-${runId}`, 1, 60);
    const event = claimed[0];
    assert.equal(event?.id, eventId);
    assert.equal((await second.claim(`second-${runId}`, 1, 60)).length, 0);
    assert.equal(
      await second.markPublished(
        `second-${runId}`,
        event!,
        "eventbridge:test",
        "wrong-owner",
        4,
      ),
      false,
    );
    assert.equal(
      await first.markPublished(
        `first-${runId}`,
        event!,
        "eventbridge:test",
        "eventbridge-reference",
        4,
      ),
      true,
    );
    const result = await control.query(
      "SELECT published_at, published_reference FROM outbox_events WHERE id = $1",
      [eventId],
    );
    assert.ok(result.rows[0]?.published_at);
    assert.equal(result.rows[0]?.published_reference, "eventbridge-reference");
    const evidence = await control.query(
      `SELECT state, destination_key FROM event_delivery_evidence
       WHERE outbox_event_id = $1 AND delivery_stage = 'transport'`,
      [eventId],
    );
    assert.equal(evidence.rows[0]?.state, "delivered");
    assert.equal(evidence.rows[0]?.destination_key, "eventbridge:test");
  } finally {
    await secondPool.end();
  }
});

test("published events fan out to an idempotent consumer inbox", async () => {
  const eventId = randomUUID();
  await seedEvent(eventId);
  const repository = new OutboxRepository(workerPool);
  const owner = `consumer-${runId}`;
  const event = (await repository.claim(owner, 1, 60))[0]!;
  await repository.markPublished(owner, event, "stdout:local", "local", 1);
  const runtime = new ConsumerRuntime(
    new ConsumerRepository(workerPool),
    owner,
    10,
    1,
    60,
  );
  const processed = await runtime.processDue();
  assert.equal(processed.claimed, 1);
  assert.equal(processed.completed, 1);
  const inbox = await control.query(
    `SELECT state, attempts, replay_sequence FROM event_consumer_inbox
     WHERE outbox_event_id = $1 AND consumer_key = 'platform.delivery-evidence'`,
    [eventId],
  );
  assert.equal(inbox.rows[0]?.state, "completed");
  assert.equal(inbox.rows[0]?.attempts, 1);
  assert.equal(inbox.rows[0]?.replay_sequence, 0);
  assert.equal((await runtime.processDue()).claimed, 0);
});

test("failed delivery is rescheduled and then dead-lettered with evidence", async () => {
  const eventId = randomUUID();
  await seedEvent(eventId);
  const repository = new OutboxRepository(workerPool);
  const owner = `retry-${runId}`;
  const first = (await repository.claim(owner, 1, 60))[0]!;
  assert.equal(first.id, eventId);
  assert.equal(
    await repository.markFailed(
      owner,
      first,
      "eventbridge:test",
      "temporary",
      new Date(Date.now() - 1_000),
      false,
      3,
    ),
    true,
  );
  const retried = (await repository.claim(owner, 1, 60))[0]!;
  assert.equal(retried.attempts, 2);
  assert.equal(
    await repository.markFailed(
      owner,
      retried,
      "eventbridge:test",
      "permanent",
      new Date(),
      true,
      3,
    ),
    true,
  );
  const result = await control.query(
    "SELECT attempts, dead_lettered_at, last_error FROM outbox_events WHERE id = $1",
    [eventId],
  );
  assert.equal(result.rows[0]?.attempts, 2);
  assert.ok(result.rows[0]?.dead_lettered_at);
  assert.equal(result.rows[0]?.last_error, "permanent");
  const evidence = await control.query(
    `SELECT state FROM event_delivery_evidence
     WHERE outbox_event_id = $1 ORDER BY recorded_at`,
    [eventId],
  );
  assert.deepEqual(evidence.rows.map((row) => row.state), ["retry", "dead-letter"]);
});

test("scheduler records reconciliation evidence", async () => {
  await control.query(
    `UPDATE scheduled_jobs SET next_run_at = now(), status = 'active'
     WHERE job_key = 'platform.event-reconciliation'`,
  );
  const scheduler = new WorkerScheduler(workerPool, `scheduler-${runId}`, 5, 1, 60);
  const result = await scheduler.processDue();
  assert.ok(result.claimed >= 1);
  assert.ok(result.completed >= 1);
  const reconciliation = await control.query(
    `SELECT state, backlog_count, dead_letter_count, consumer_lag_count
     FROM event_reconciliation_runs ORDER BY started_at DESC LIMIT 1`,
  );
  assert.equal(reconciliation.rows[0]?.state, "completed");
});
