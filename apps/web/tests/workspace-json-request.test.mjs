import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("workspace transport derives tenant context only from a validated membership", async () => {
  const transport = await source("../src/server/workspace-json-request.ts");
  assert.match(transport, /getWebOidcSession\(\)/);
  assert.match(transport, /cookies\(\)/);
  assert.match(transport, /membershipCookieName/);
  assert.match(transport, /membershipIdPattern\.test\(membershipId\)/);
  assert.match(transport, /headers\.set\("x-veza-membership-id", auth\.membershipId\)/);
  assert.doesNotMatch(transport, /x-veza-tenant-id/);
});

test("workspace transport owns protected headers and bounded JSON parsing", async () => {
  const transport = await source("../src/server/workspace-json-request.ts");
  assert.match(transport, /new Headers\(options\.init\?\.headers\)/);
  assert.match(transport, /headers\.set\("authorization"/);
  assert.match(transport, /TextEncoder\(\)\.encode\(text\)\.byteLength/);
  assert.match(transport, /AbortSignal\.timeout/);
  assert.match(transport, /path\.startsWith\("\/v1\/"\)/);
  assert.match(transport, /response\.status/);
  assert.match(transport, /returned invalid JSON/);
});
