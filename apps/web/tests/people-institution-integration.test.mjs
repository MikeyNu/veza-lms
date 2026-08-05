import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("person records mount relationship lifecycle controls", async () => {
  const source = await read("src/features/people/person-record.tsx");
  assert.match(source, /RelationshipLifecycle/);
  assert.match(source, /institutionId/);
  assert.match(source, /Create relationship/);
});

test("relationship BFF requires and forwards an institution identifier", async () => {
  const [route, api] = await Promise.all([
    read("app/api/people/[personId]/relationships/route.ts"),
    read("src/server/people-api.ts"),
  ]);
  assert.match(route, /Institution identifier is required/);
  assert.match(route, /createRelationship\(personId, institutionId/);
  assert.match(api, /institutions\/\$\{institutionId\}\/relationships/);
});

test("people administration exposes duplicate reconciliation", async () => {
  const page = await read("app/people/page.tsx");
  assert.match(page, /\/people\/duplicates/);
  assert.match(page, /Review duplicate candidates/);
});
