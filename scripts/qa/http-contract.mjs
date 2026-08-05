import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4000";

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

const live = await json("/v1/health/live");
assert.equal(live.response.status, 200);
assert.equal(live.body.status, "live");
assert.equal(live.body.service, "veza-api");
assert.ok(Number.isInteger(live.body.uptimeSeconds));
assert.ok(!Number.isNaN(Date.parse(live.body.timestamp)));

const ready = await json("/v1/health/ready");
assert.equal(ready.response.status, 200);
assert.ok(["ready", "degraded"].includes(ready.body.status));
assert.equal(ready.body.checks.database.status, "up");

const missing = await json("/v1/this-route-must-not-exist");
assert.equal(missing.response.status, 404);
assert.equal(missing.response.headers.get("content-type")?.startsWith("application/json"), true);

process.stdout.write("API HTTP controller contracts passed.\n");
