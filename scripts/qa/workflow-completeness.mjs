import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import catalogue from "../../qa/features/platform-features.mjs";
import matrix from "../../qa/workflows/platform-workflows.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactRoot = join(repositoryRoot, "qa-artifacts", "workflows");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(path) {
  try {
    await access(join(repositoryRoot, path));
    return true;
  } catch {
    return false;
  }
}

function validateCompletionFeatures() {
  const featureIds = new Set();
  let featureCount = 0;
  for (const category of catalogue.categories) {
    for (const feature of category.features) {
      featureCount += 1;
      featureIds.add(feature.id);
    }
  }
  invariant(catalogue.categories.length >= 24, `Feature catalogue contains only ${catalogue.categories.length} domains`);
  invariant(featureCount >= 561, `Feature catalogue contains only ${featureCount} capabilities`);
  for (const critical of [
    "identity-journey-hardening.browser-invitation-acceptance-journey",
    "identity-journey-hardening.password-recovery-identity-provider-handoff",
    "access-administration-completion.institutional-access-administration-workspace",
    "access-administration-completion.invitation-token-rotation-and-resend",
    "bounded-bulk-lifecycle.atomic-people-status-batch",
    "bounded-bulk-lifecycle.atomic-invitation-revocation-batch",
    "experience-resilience.shared-workspace-loading-skeleton",
    "experience-resilience.executable-crud-lifecycle-gate",
    "experience-resilience.executable-workflow-completeness-gate",
  ]) {
    invariant(featureIds.has(critical), `Completion feature is missing from the catalogue: ${critical}`);
  }
  return featureCount;
}

async function main() {
  invariant(matrix.version === 1, "Unsupported workflow matrix version");
  invariant(matrix.status === "authoritative", "Workflow matrix must be authoritative");
  invariant(Array.isArray(matrix.workflows) && matrix.workflows.length >= 12, "Workflow matrix is incomplete");
  const featureCount = validateCompletionFeatures();

  const workflowIds = new Set();
  const stepIds = new Set();
  const allPaths = new Set();
  const summaries = [];

  for (const workflow of matrix.workflows) {
    invariant(typeof workflow.id === "string" && /^[a-z][a-z0-9.-]+$/.test(workflow.id), `Invalid workflow id: ${workflow.id}`);
    invariant(!workflowIds.has(workflow.id), `Duplicate workflow id: ${workflow.id}`);
    workflowIds.add(workflow.id);
    invariant(typeof workflow.name === "string" && workflow.name.length >= 8, `${workflow.id} has no name`);
    invariant(Array.isArray(workflow.actors) && workflow.actors.length > 0, `${workflow.id} has no actors`);
    invariant(typeof workflow.entry === "string" && workflow.entry.length >= 20, `${workflow.id} has no entry condition`);
    invariant(typeof workflow.exit === "string" && workflow.exit.length >= 20, `${workflow.id} has no exit condition`);
    invariant(typeof workflow.browserRoute === "string" && await exists(workflow.browserRoute), `${workflow.id} browser route is missing: ${workflow.browserRoute}`);
    invariant(Array.isArray(workflow.failureStates) && workflow.failureStates.length >= 3, `${workflow.id} has insufficient failure-state coverage`);
    invariant(Array.isArray(workflow.steps) && workflow.steps.length >= 3, `${workflow.id} has too few workflow steps`);
    invariant(Array.isArray(workflow.tests) && workflow.tests.length > 0, `${workflow.id} has no verification owner`);
    invariant(!/[—]/.test(JSON.stringify(workflow)), `${workflow.id} contains a prohibited em dash`);

    for (const path of workflow.tests) {
      invariant(await exists(path), `${workflow.id} references missing test path ${path}`);
      allPaths.add(path);
    }
    for (const step of workflow.steps) {
      const composite = `${workflow.id}.${step.id}`;
      invariant(typeof step.id === "string" && /^[a-z][a-z0-9-]+$/.test(step.id), `${workflow.id} has invalid step id ${step.id}`);
      invariant(!stepIds.has(composite), `Duplicate workflow step: ${composite}`);
      stepIds.add(composite);
      invariant(typeof step.action === "string" && step.action.length >= 20, `${composite} has no action contract`);
      invariant(Array.isArray(step.paths) && step.paths.length > 0, `${composite} has no implementation path`);
      for (const path of step.paths) {
        invariant(await exists(path), `${composite} references missing path ${path}`);
        allPaths.add(path);
      }
    }

    summaries.push({
      id: workflow.id,
      actors: workflow.actors,
      stepCount: workflow.steps.length,
      failureStateCount: workflow.failureStates.length,
      browserRoute: workflow.browserRoute,
    });
  }

  for (const critical of [
    "identity.invitation-to-workspace.invitation-accept",
    "identity.account-recovery.trusted-recovery-handoff",
    "institution.first-activation.activation-command",
    "people.person-to-enrolment.enrolment-create",
    "curriculum.authoring-to-delivery.independent-review",
    "assessment.assignment-to-result.submission-start",
    "assessment.assignment-to-result.submission-receipt",
    "assessment.assignment-to-result.result-release",
    "credentials.eligibility-to-verification.public-verification",
    "exports.request-to-expiry.export-download",
    "exports.request-to-expiry.export-expiry",
  ]) {
    invariant(stepIds.has(critical), `Critical workflow step is missing: ${critical}`);
  }

  await mkdir(artifactRoot, { recursive: true });
  await writeFile(join(artifactRoot, "platform-workflows.json"), `${JSON.stringify(matrix, null, 2)}\n`);
  await writeFile(join(artifactRoot, "summary.json"), `${JSON.stringify({
    featureCount,
    workflowCount: matrix.workflows.length,
    stepCount: stepIds.size,
    implementationPathCount: allPaths.size,
    workflows: summaries,
  }, null, 2)}\n`);
  process.stdout.write(`Workflow completeness gate validated ${featureCount} capabilities, ${matrix.workflows.length} workflows and ${stepIds.size} steps.\n`);
}

await main();
