import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("service health remains operator guarded and runtime validated", async () => {
  const [page, api, shell] = await Promise.all([
    source("../app/health/page.tsx"),
    source("../src/server/service-health-api.ts"),
    source("../src/components/control-plane-shell.tsx"),
  ]);
  assert.match(page, /requireOperatorSession/);
  assert.match(page, /loadServiceHealth/);
  assert.match(api, /maximumResponseBytes/);
  assert.match(api, /response\.status !== 503/);
  assert.match(api, /pendingEvents/);
  assert.match(shell, /href: "\/health"[\s\S]*available: true/);
});

test("service health UI communicates dependency state without tenant data", async () => {
  const [view, css, globals] = await Promise.all([
    source("../src/features/health/service-health.tsx"),
    source("../styles/service-health.css"),
    source("../app/globals.css"),
  ]);
  assert.match(view, /PostgreSQL/);
  assert.match(view, /Outbox delivery/);
  assert.match(view, /Operational metadata only/);
  assert.doesNotMatch(view, /learnerName|courseTitle|submission/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(globals, /service-health\.css/);
});
