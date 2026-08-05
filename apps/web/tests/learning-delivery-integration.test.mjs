import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("course room mounts assignments, resumable evidence and learner gradebook", async () => {
  const [page, panel, upload] = await Promise.all([
    source("../app/courses/[enrolmentId]/page.tsx"),
    source("../src/features/learner/learner-assignment-panel.tsx"),
    source("../app/api/submission-upload/route.ts"),
  ]);
  assert.match(page, /LearnerAssignmentPanel/);
  assert.match(page, /loadLearnerGradebook/);
  assert.match(panel, /submission-start/);
  assert.match(panel, /submission-offset/);
  assert.match(panel, /receiptChecksum/);
  assert.match(panel, /resultReleasedAt/);
  assert.match(upload, /VEZA_OBJECT_STORAGE_INGEST_URL/);
  assert.match(upload, /isSameOriginRequest/);
});

test("Studio routes mount structured authoring and governed publication workflows", async () => {
  const [home, lesson, workspace, bff] = await Promise.all([
    source("../app/studio/page.tsx"),
    source("../app/studio/lessons/[lessonId]/page.tsx"),
    source("../src/features/studio/studio-complete-workspaces.tsx"),
    source("../app/api/studio/[operation]/route.ts"),
  ]);
  assert.match(home, /StudioHomeWorkspaceComplete/);
  assert.match(home, /loadStudioLibrary/);
  assert.match(lesson, /StudioLessonEditorComplete/);
  assert.match(workspace, /BLOCK INSPECTOR/);
  assert.match(workspace, /COLLABORATIVE REVIEW/);
  assert.match(workspace, /Rollback and republish/);
  assert.match(workspace, /Analyse course import/);
  assert.match(bff, /asset-register/);
  assert.match(bff, /review-decision/);
  assert.match(bff, /course-publish/);
});

test("staff workspaces expose rubric, group, feedback, result and credential governance", async () => {
  const [assessment, evidence, controls, gradebook] = await Promise.all([
    source("../app/assessments/page.tsx"),
    source("../app/evidence/page.tsx"),
    source("../src/features/academic-evidence/academic-governance-completion.tsx"),
    source("../src/features/academic-evidence/staff-gradebook-workspace.tsx"),
  ]);
  assert.match(assessment, /AssessmentGovernanceCompletion/);
  assert.match(assessment, /StaffGradebookDirectory/);
  assert.match(evidence, /CredentialGovernanceCompletion/);
  assert.match(controls, /rubric-create/);
  assert.match(controls, /assignment-group-create/);
  assert.match(controls, /marker-allocate/);
  assert.match(controls, /mark-release/);
  assert.match(controls, /certificate-template-approve/);
  assert.match(controls, /award-evaluate/);
  assert.match(gradebook, /mode: "staff"|STAFF GRADEBOOK/);
});

test("academic BFF remains an explicit same-origin allowlist", async () => {
  const route = await source("../app/api/academic/[operation]/route.ts");
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /rubric-approve/);
  assert.match(route, /assignment-group-members/);
  assert.match(route, /mark-release/);
  assert.match(route, /certificate-template-approve/);
  assert.doesNotMatch(route, /\[\.\.\.path\]/);
});
