import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("delivery recovery remains payload blind, operator guarded and contract bounded", async () => {
  const [api, queue, form, route] = await Promise.all([
    source("../src/server/dead-letter-api.ts"),
    source("../src/features/delivery-failures/dead-letter-queue.tsx"),
    source("../src/features/delivery-failures/requeue-dead-letter-form.tsx"),
    source("../app/api/delivery-failures/[eventId]/requeue/route.ts"),
  ]);
  assert.doesNotMatch(api, /payload/);
  assert.doesNotMatch(queue, /payload/);
  assert.match(api, /maximumResponseBytes/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /getOperatorSession/);
  assert.match(route, /Object\.keys\(payload\)\.length !== 1/);
  assert.match(route, /sensitiveText/);
  assert.match(route, /x-correlation-id/);
  assert.match(form, /minLength=\{20\}/);
  assert.match(form, /type="checkbox"/);
  assert.match(form, /idempotency-key/);
  assert.match(form, /requestReason/);
});

test("delivery recovery uses a focused queue and inspector instead of repeated action cards", async () => {
  const [page, queue, shell, globals, css] = await Promise.all([
    source("../app/delivery-failures/page.tsx"),
    source("../src/features/delivery-failures/dead-letter-queue.tsx"),
    source("../src/components/control-plane-shell.tsx"),
    source("../app/globals.css"),
    source("../styles/delivery-failures.css"),
  ]);
  assert.match(page, /selectedId/);
  assert.match(queue, /<table className="failure-table">/);
  assert.match(queue, /failure-inspector/);
  assert.match(queue, /Payload boundary enforced/);
  assert.match(shell, /Delivery recovery/);
  assert.match(globals, /delivery-failures\.css/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.55fr\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(queue, /failure-card/);
});
