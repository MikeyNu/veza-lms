import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("plan catalogue is operator guarded, bounded and non-mutating", async () => {
  const [page, api, view, shell] = await Promise.all([
    source("../app/plans/page.tsx"),
    source("../src/server/plans-api.ts"),
    source("../src/features/plans/plan-catalogue.tsx"),
    source("../src/components/control-plane-shell.tsx"),
  ]);
  assert.match(page, /requireOperatorSession/);
  assert.match(api, /maximumResponseBytes/);
  assert.match(api, /control-plane\/plans/);
  assert.match(view, /Plan edits remain deliberately unavailable/);
  assert.doesNotMatch(view, /method="post"/);
  assert.match(shell, /href: "\/plans"/);
});

test("plan catalogue uses responsive comparison cards", async () => {
  const [css, globals] = await Promise.all([
    source("../styles/plan-catalogue.css"),
    source("../app/globals.css"),
  ]);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(globals, /plan-catalogue\.css/);
});
