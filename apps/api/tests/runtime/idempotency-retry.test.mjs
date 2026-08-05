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
const control = new Pool({ connectionString: required("CONTROL_PLANE_DATABASE_URL"), max: 4, statement_timeout: 10_000 });
const key = `qe-idempotency-${randomUUID()}`;
const actorId = randomUUID();

test.before(async () => {
  await control.query(
    `INSERT INTO users (id, identity_issuer, identity_subject, email, display_name, status)
     VALUES ($1, 'https://idempotency.qe.invalid', $2, $3, 'Idempotency operator', 'active')`,
    [actorId, key, `${key}@example.invalid`],
  );
});

test.after(async () => control.end());

test("concurrent reservation of one idempotency key has one winner", async () => {
  const reserve = (hash) => control.query(
    `INSERT INTO provisioning_requests (idempotency_key, actor_id, request_hash, status)
     VALUES ($1, $2, $3, 'processing')`,
    [key, actorId, hash],
  );
  const results = await Promise.allSettled([reserve("request-a"), reserve("request-a")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("a retry can read the stable completed response without creating a duplicate", async () => {
  const stable = { tenantId: randomUUID(), status: "provisioning" };
  await control.query(
    `UPDATE provisioning_requests
     SET status = 'completed', response = $2::jsonb, updated_at = now()
     WHERE idempotency_key = $1`,
    [key, JSON.stringify(stable)],
  );
  const retry = await control.query(
    "SELECT status, response FROM provisioning_requests WHERE idempotency_key = $1",
    [key],
  );
  assert.equal(retry.rowCount, 1);
  assert.equal(retry.rows[0].status, "completed");
  assert.deepEqual(retry.rows[0].response, stable);
});

test("reusing a completed key with a different canonical request is detectable", async () => {
  const result = await control.query(
    "SELECT request_hash FROM provisioning_requests WHERE idempotency_key = $1",
    [key],
  );
  assert.notEqual(result.rows[0].request_hash, "request-b");
});
