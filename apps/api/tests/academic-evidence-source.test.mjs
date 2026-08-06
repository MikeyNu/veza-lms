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
  const [service, definition, controller, migration] = await Promise.all([
    source("../src/modules/academic-evidence/application/academic-governance.service.ts"),
    source("../src/modules/academic-evidence/application/credential-definition.service.ts"),
    source("../src/modules/academic-evidence/http/credential-definition.controller.ts"),
    source("../database/migrations/0027_assessment_governance_completion.sql"),
  ]);
  assert.match(service, /Rubric approval requires an independent reviewer/);
  assert.match(service, /Certificate-template approval requires an independent reviewer/);
  assert.match(service, /persisted award evaluation/);
  assert.match(definition, /approved certificate template/);
  assert.match(definition, /credentials\.award-rule\.created/);
  assert.match(controller, /CredentialDefinitionService/);
  assert.match(migration, /rubrics_approval_segregation_check/);
  assert.match(migration, /certificate_templates_approval_segregation_check/);
  assert.match(migration, /award_rule_evaluations/);
});

test("grade corrections, marker identity and metric refresh remain evidence driven", async () => {
  const [resultMigration, markerMigration, workerMigration, workerMain] = await Promise.all([
    source("../database/migrations/0028_result_release_and_studio_integrity.sql"),
    source("../database/migrations/0032_marker_allocation_identity_guard.sql"),
    source("../database/migrations/0029_metric_worker_execution.sql"),
    source("../../worker/src/main.ts"),
  ]);
  assert.match(resultMigration, /supersedes_result_id/);
  assert.match(resultMigration, /SET state='corrected'/);
  assert.match(markerMigration, /mark evidence must be created by the allocated marker identity/);
  assert.match(markerMigration, /linked_user_id/);
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

test("governed exports are rendered by the worker and cannot be manually completed by clients", async () => {
  const [dto, controller, exportController, exportService, migration, worker, renderer] = await Promise.all([
    source("../src/modules/academic-evidence/application/academic-evidence.dto.ts"),
    source("../src/modules/academic-evidence/http/academic-evidence.controller.ts"),
    source("../src/modules/academic-evidence/http/academic-export.controller.ts"),
    source("../src/modules/academic-evidence/application/academic-export.service.ts"),
    source("../database/migrations/0052_governed_document_exports.sql"),
    source("../../worker/src/main.ts"),
    source("../../worker/src/export-document.ts"),
  ]);
  assert.match(dto, /\["csv", "json", "pdf"\]/);
  assert.doesNotMatch(controller, /exports\/:exportId\/complete/);
  assert.match(exportController, /:exportId\/download/);
  assert.match(exportService, /failed checksum verification/);
  assert.match(migration, /app\.claim_export_jobs/);
  assert.match(migration, /app\.complete_export_job/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION app\.claim_export_jobs/);
  assert.match(worker, /exportProcessor\.processDue/);
  assert.match(renderer, /%PDF-1\.7/);
  assert.match(renderer, /checksumSha256/);
});
