import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("learning route loads real institution catalogue data", async () => {
  const page = await read("../app/learning/page.tsx");
  assert.match(page, /loadCatalogue\(institutionId\)/);
  assert.match(page, /loadCatalogueReferences\(institutionId\)/);
  assert.match(page, /CatalogueWorkspaceView/);
  assert.doesNotMatch(page, /readiness|planned module|coming soon/i);
});

test("catalogue workspace supports governed curriculum delivery and enrolment", async () => {
  const workspace = await read("../src/features/catalogue/catalogue-workspace.tsx");
  for (const label of [
    "Create outcome",
    "Create programme",
    "Create course",
    "Schedule course run",
    "Create cohort",
    "Create class",
    "Enrol learner",
  ]) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /Approve/);
  assert.match(workspace, /eligibleLearners/);
  assert.match(workspace, /approvedBlueprints/);
});

test("catalogue BFF routes preserve the server trust boundary", async () => {
  const mutation = await read("../app/api/catalogue/[operation]/route.ts");
  const approval = await read("../app/api/catalogue/approve/[kind]/[versionId]/route.ts");
  const transfer = await read("../app/api/catalogue/enrolments/[enrolmentId]/transfer/route.ts");
  for (const source of [mutation, approval, transfer]) {
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
