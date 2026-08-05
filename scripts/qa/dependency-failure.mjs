import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4001";
const live = await fetch(`${baseUrl}/v1/health/live`);
assert.equal(live.status, 200, "liveness must not depend on PostgreSQL availability");
const liveBody = await live.json();
assert.equal(liveBody.status, "live");

const ready = await fetch(`${baseUrl}/v1/health/ready`);
assert.equal(ready.status, 503, "readiness must fail closed when PostgreSQL is unavailable");
const body = await ready.json();
const payload = body.response ?? body;
assert.equal(payload.status, "not-ready");
assert.equal(payload.checks.database.status, "down");
assert.equal(payload.checks.eventDelivery.status, "down");

process.stdout.write("Dependency failure behaviour passed.\n");
