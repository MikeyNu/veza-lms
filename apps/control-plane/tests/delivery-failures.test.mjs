import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("delivery-failure UI remains payload blind and requires an explicit reason", async () => {
  const [api, feature, route] = await Promise.all([
    source("../src/server/dead-letter-api.ts"),
    source("../src/features/delivery-failures/dead-letter-queue.tsx"),
    source("../app/api/delivery-failures/[eventId]/requeue/route.ts"),
  ]);
  assert.doesNotMatch(api, /payload/);
  assert.doesNotMatch(feature, /payload/);
  assert.match(feature, /minLength=\{20\}/);
  assert.match(feature, /idempotency-key/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /getOperatorSession/);
  assert.match(route, /x-correlation-id/);
  assert.match(route, /Object\.keys\(payload\)/);
});

test("delivery failures are a real responsive control-plane destination", async () => {
  const [shell, globals, css] = await Promise.all([
    source("../src/components/control-plane-shell.tsx"),
    source("../app/globals.css"),
    source("../styles/delivery-failures.css"),
  ]);
  assert.match(shell, /\/delivery-failures/);
  assert.match(globals, /delivery-failures\.css/);
  assert.match(css, /grid-template-columns:repeat\(2/);
  assert.match(css, /@media\(max-width:620px\)/);
});
