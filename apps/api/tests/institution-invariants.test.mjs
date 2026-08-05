import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("institution hierarchy invariants are enforced in PostgreSQL", async () => {
  const migration = await source("../database/migrations/0004_institution_structure_invariants.sql");
  assert.match(migration, /validate_organisational_unit_hierarchy/);
  assert.match(migration, /Organisational unit hierarchy cannot contain a cycle/);
  assert.match(migration, /validate_academic_period_hierarchy/);
  assert.match(migration, /Child academic period must remain inside the parent period/);
  assert.match(migration, /Parent academic period must be published before its child/);
  assert.match(migration, /Academic period cannot exclude an existing child period/);
});

test("institution integration coverage uses the actual application and control-plane identities", async () => {
  const [integration, packageJson, workflow] = await Promise.all([
    source("integration/institution-structure.test.mjs"),
    source("../package.json"),
    source("../../../.github/workflows/ci.yml"),
  ]);
  assert.match(integration, /DATABASE_URL/);
  assert.match(integration, /CONTROL_PLANE_DATABASE_URL/);
  assert.match(integration, /row-level security/);
  assert.match(integration, /cannot contain a cycle/);
  assert.match(packageJson, /test:integration/);
  assert.match(workflow, /database-integration/);
  assert.match(workflow, /db:bootstrap:test/);
  assert.match(workflow, /db:migrate/);
});
