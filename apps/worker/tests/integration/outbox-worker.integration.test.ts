import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { OutboxRepository } from "../../src/outbox-repository.js";

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

test("leases prevent concurrent claims and acknowledgements require ownership", async () => {
  const eventId = randomUUID();
  await seedEvent(eventId);
  const first = new OutboxRepository(workerPool);
  const secondPool = new Pool({ connectionString: required("WORKER_DATABASE_URL") });
  const second = new OutboxRepository(secondPool);
  try {
    const claimed = await first.claim(`first-${runId}`, 1, 60);
    assert.equal(claimed[0]?.id, eventId);
    assert.equal((await second.claim(`second-${runId}`, 1, 60)).length, 0);
    assert.equal(await second.markPublished(`second-${runId}`, eventId, "wrong-owner"), false);
    assert.equal(await first.markPublished(`first-${runId}`, eventId, "eventbridge:test"), true);
    const result = await control.query(
      "SELECT published_at, published_reference FROM outbox_events WHERE id = $1",
      [eventId],
    );
    assert.ok(result.rows[0]?.published_at);
    assert.equal(result.rows[0]?.published_reference, "eventbridge:test");
  } finally {
    await secondPool.end();
  }
});

test("failed delivery is rescheduled and then dead-lettered", async () => {
  const eventId = randomUUID();
  await seedEvent(eventId);
  const repository = new OutboxRepository(workerPool);
  const owner = `retry-${runId}`;
  const first = await repository.claim(owner, 1, 60);
  assert.equal(first[0]?.id, eventId);
  assert.equal(
    await repository.markFailed(owner, first[0]!, "temporary", new Date(Date.now() - 1_000), false),
    true,
  );
  const retried = await repository.claim(owner, 1, 60);
  assert.equal(retried[0]?.attempts, 2);
  assert.equal(
    await repository.markFailed(owner, retried[0]!, "permanent", new Date(), true),
    true,
  );
  const result = await control.query(
    "SELECT attempts, dead_lettered_at, last_error FROM outbox_events WHERE id = $1",
    [eventId],
  );
  assert.equal(result.rows[0]?.attempts, 2);
  assert.ok(result.rows[0]?.dead_lettered_at);
  assert.equal(result.rows[0]?.last_error, "permanent");
});
