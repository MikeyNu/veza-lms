import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("catalogue schema separates definitions, approved versions and delivery records", async () => {
  const migration = await read("../database/migrations/0011_catalogue_curriculum_enrolment.sql");
  for (const table of [
    "learning_outcomes",
    "programmes",
    "programme_versions",
    "course_definitions",
    "course_blueprint_versions",
    "course_runs",
    "cohorts",
    "class_sections",
    "enrolments",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
  assert.match(migration, /WHERE effective_until IS NULL AND status NOT IN \('cancelled','withdrawn'\)/);
});

test("approved curriculum and child composition are database immutable", async () => {
  const hardening = await read("../database/migrations/0013_curriculum_immutability_hardening.sql");
  assert.match(hardening, /protect_approved_programme_version/);
  assert.match(hardening, /protect_approved_blueprint_version/);
  assert.match(hardening, /delivery_modes IS DISTINCT FROM OLD\.delivery_modes/);
  assert.match(hardening, /approved curriculum composition is immutable/);
});

test("catalogue controller uses institution resource authorization", async () => {
  const controller = await read("../src/modules/catalogue/http/catalogue.controller.ts");
  const governance = await read("../src/modules/catalogue/http/catalogue-governance.controller.ts");
  for (const source of [controller, governance]) {
    assert.match(source, /buildInstitutionResource\(institutionId\)/);
    assert.doesNotMatch(source, /RequiresTenantPermission/);
  }
  assert.match(controller, /UseGuards\(MfaGuard\)/);
  assert.match(governance, /enrolmentTransfer|changeEnrolmentStatus/);
});

test("enrolment workflows preserve transitions and reject unsafe completion", async () => {
  const service = await read("../src/modules/catalogue/application/catalogue-governance.service.ts");
  assert.match(service, /INSERT INTO enrolment_transitions/);
  assert.match(service, /Resolve current enrolments before completing the run/);
  assert.match(service, /Enrolment cannot move from/);
  assert.match(service, /Completed enrolments require a result/);
});
