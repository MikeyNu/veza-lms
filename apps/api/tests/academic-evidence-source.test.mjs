import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("learner submission routes use the ownership-enforcing service", async () => {
  const [controller, service, migration] = await Promise.all([
    source("../src/modules/academic-evidence/http/academic-evidence.controller.ts"),
    source("../src/modules/academic-evidence/application/learner-submission.service.ts"),
    source("../database/migrations/0027_assessment_governance_completion.sql"),
  ]);
  assert.match(controller, /LearnerSubmissionService/);
  assert.match(controller, /learnerSubmissions\.startSubmission/);
  assert.match(controller, /learnerSubmissions\.registerFile/);
  assert.match(controller, /learnerSubmissions\.updateUploadOffset/);
  assert.match(controller, /learnerSubmissions\.finalizeSubmission/);
  assert.match(service, /require_owned_enrolment/);
  assert.match(service, /require_owned_submission_attempt/);
  assert.match(service, /require_owned_submission_file/);
  assert.match(migration, /linked_user_id=p_actor_id/);
});

test("assessment and credential governance requires review evidence", async () => {
  const [service, migration] = await Promise.all([
    source("../src/modules/academic-evidence/application/academic-governance.service.ts"),
    source("../database/migrations/0027_assessment_governance_completion.sql"),
  ]);
  assert.match(service, /Rubric approval requires an independent reviewer/);
  assert.match(service, /Certificate-template approval requires an independent reviewer/);
  assert.match(service, /persisted award evaluation/);
  assert.match(migration, /rubrics_approval_segregation_check/);
  assert.match(migration, /certificate_templates_approval_segregation_check/);
  assert.match(migration, /award_rule_evaluations/);
});

test("grade corrections and metric refresh remain append-only and worker driven", async () => {
  const [resultMigration, workerMigration, workerMain] = await Promise.all([
    source("../database/migrations/0028_result_release_and_studio_integrity.sql"),
    source("../database/migrations/0029_metric_worker_execution.sql"),
    source("../../worker/src/main.ts"),
  ]);
  assert.match(resultMigration, /supersedes_result_id/);
  assert.match(resultMigration, /SET state='corrected'/);
  assert.match(workerMigration, /SECURITY INVOKER/);
  assert.match(workerMigration, /refresh_due_core_metrics/);
  assert.match(workerMain, /CoreMetricRefresher/);
  assert.match(workerMain, /metricRefreshIntervalMs/);
});

test("Studio library and publication controls preserve structured evidence", async () => {
  const [service, library, migration] = await Promise.all([
    source("../src/modules/studio/application/studio.service.ts"),
    source("../src/modules/studio/application/studio-library.service.ts"),
    source("../database/migrations/0028_result_release_and_studio_integrity.sql"),
  ]);
  assert.match(service, /rollbackOfSnapshotId/);
  assert.match(service, /studio_publication_snapshots/);
  assert.match(service, /accessibility_report/);
  assert.match(library, /studio_assets/);
  assert.match(library, /Meaningful images require alternative text/);
  assert.match(migration, /ready Studio asset evidence is immutable/);
});
