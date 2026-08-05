import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const endpoint = `${baseUrl}/api/institution-setup/activate`;

const crossOrigin = await fetch(endpoint, {
  method: "POST",
  headers: { origin: "https://attacker.invalid", "content-type": "application/json" },
  body: "{}",
});
assert.equal(crossOrigin.status, 403);
assert.equal(crossOrigin.headers.get("cache-control"), "no-store");

const wrongType = await fetch(endpoint, {
  method: "POST",
  headers: { origin: baseUrl, "content-type": "text/plain" },
  body: "{}",
});
assert.equal(wrongType.status, 415);

const noSession = await fetch(endpoint, {
  method: "POST",
  headers: { origin: baseUrl, "content-type": "application/json" },
  body: "{}",
});
assert.equal(noSession.status, 401);

const unavailable = await fetch(`${baseUrl}/api/institution-setup/not-allowed`, {
  method: "POST",
  headers: { origin: baseUrl, "content-type": "application/json" },
  body: "{}",
});
assert.equal(unavailable.status, 404);

process.stdout.write("Institution setup BFF runtime contracts passed.\n");
