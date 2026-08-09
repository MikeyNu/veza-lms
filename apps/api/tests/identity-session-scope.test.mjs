import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace sessions derive institutions from the complete RBAC scope hierarchy", async () => {
  const repository = await readFile(
    new URL(
      "../src/modules/identity-access/infrastructure/identity-session.repository.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(repository, /resolveInstitutionIds/);
  assert.match(repository, /withTenantTransaction/);
  for (const scope of ["tenant", "institution", "campus", "programme", "course", "cohort", "self"]) {
    assert.match(repository, new RegExp(`scopeIds\\(\"${scope}\"\\)|scope_type === \"${scope}\"`));
  }
  for (const table of [
    "institutions",
    "campuses",
    "programmes",
    "course_definitions",
    "course_runs",
    "cohorts",
    "learner_profiles",
    "staff_profiles",
  ]) {
    assert.match(repository, new RegExp(`FROM ${table}|JOIN ${table}`));
  }
  assert.match(repository, /institution\.status <> 'archived'/);
  assert.match(repository, /CASE institution\.status WHEN 'active' THEN 0 ELSE 1 END/);
});
