import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("learning route loads the governed academic operations workspace", async () => {
  const page = await read("../app/learning/page.tsx");
  assert.match(page, /loadCatalogue\(institutionId\)/);
  assert.match(page, /loadCatalogueReferences\(institutionId\)/);
  assert.match(page, /CurriculumGovernanceWorkspace/);
  assert.match(page, /DeliveryStructureActions/);
  assert.doesNotMatch(page, /CatalogueWorkspaceView/);
  assert.doesNotMatch(page, /readiness|planned module|coming soon/i);
});

test("replacement catalogue surfaces preserve every unique creation entry point", async () => {
  const [governance, structure] = await Promise.all([
    read("../src/features/catalogue/curriculum-governance-workspace.tsx"),
    read("../src/features/catalogue/delivery-structure-actions.tsx"),
  ]);
  const replacement = `${governance}\n${structure}`;

  for (const label of [
    "Create learning outcome",
    "Create programme version",
    "Create subject, module, course or unit",
    "Schedule course run",
    "Create cohort",
    "Create class",
    "Enrol eligible learner",
  ]) {
    assert.match(replacement, new RegExp(label));
  }

  assert.match(governance, /Approve reviewed version/);
  assert.match(governance, /eligibleLearners/);
  assert.match(governance, /approvedBlueprints/);
  assert.match(structure, /operation="cohorts"/);
  assert.match(structure, /operation="classes"/);
});

test("catalogue BFF mutation allowlist covers every migrated creation operation", async () => {
  const mutation = await read("../app/api/catalogue/[operation]/route.ts");
  for (const operation of [
    "outcomes",
    "programmes",
    "blueprints",
    "runs",
    "cohorts",
    "classes",
    "enrolments",
  ]) {
    assert.match(mutation, new RegExp(`\\"${operation}\\"`));
  }
  assert.match(mutation, /isSameOriginRequest/);
  assert.match(mutation, /institutionId/);
  assert.doesNotMatch(mutation, /x-tenant-id/i);
});

test("catalogue lifecycle routes preserve the server trust boundary", async () => {
  const [approval, transfer] = await Promise.all([
    read("../app/api/catalogue/approve/[kind]/[versionId]/route.ts"),
    read("../app/api/catalogue/enrolments/[enrolmentId]/transfer/route.ts"),
  ]);
  for (const source of [approval, transfer]) {
    assert.match(source, /isSameOriginRequest/);
    assert.match(source, /institutionId/);
    assert.doesNotMatch(source, /x-tenant-id/i);
  }
});

test("catalogue governance client matches the API controller routes", async () => {
  const [client, controller] = await Promise.all([
    read("../src/server/catalogue-api.ts"),
    read("../../api/src/modules/catalogue/http/catalogue-governance.controller.ts"),
  ]);
  for (const route of [
    "programmes/versions/${programmeVersionId}/courses",
    "blueprints/versions/${blueprintVersionId}/requisites",
    "runs/${courseRunId}/lifecycle",
    "enrolments/${enrolmentId}/status",
    "classes/${classSectionId}/staff",
  ]) assert.equal(client.includes(route), true, `Client route is missing: ${route}`);
  for (const route of [
    "programmes/versions/:versionId/courses",
    "blueprints/versions/:versionId/requisites",
    "runs/:runId/lifecycle",
    "enrolments/:enrolmentId/status",
    "classes/:classSectionId/staff",
  ]) assert.equal(controller.includes(route), true, `Controller route is missing: ${route}`);
  assert.doesNotMatch(client, /runs\/\$\{courseRunId\}\/transition/);
  assert.doesNotMatch(client, /enrolments\/\$\{enrolmentId\}\/transition/);
  assert.doesNotMatch(client, /staff-allocations/);
});
