import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import registry from "../../qa/crud/managed-aggregates.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactRoot = join(repositoryRoot, "qa-artifacts", "crud");
const operationKeys = [
  "create",
  "collectionRead",
  "recordRead",
  "amendOrSupersede",
  "transition",
  "retireOrArchive",
  "hardDelete",
  "bulk",
];
const operationDecisions = new Set(["implemented", "prohibited", "individual-only", "not-applicable"]);
const safeguardDecisions = new Set([
  "required",
  "conditional",
  "not-applicable",
  "derived-self-or-staff",
  "platform-operator",
  "platform-operator-and-customer-approval",
  "idempotent",
  "lease-and-attempt",
  "lease-and-idempotency",
  "lease-and-version",
  "monotonic-offset",
]);
const ignoredDirectories = new Set(["node_modules", "dist", ".next", ".turbo", ".git", "coverage", "qa-artifacts"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(root) {
  if (!(await exists(root))) return [];
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:ts|tsx|mjs|sql|json|md)$/.test(entry.name)) output.push(path);
    }
  }
  await visit(root);
  return output;
}

function repoPath(path) {
  return relative(repositoryRoot, path).split(sep).join("/");
}

async function corpusFor(roots) {
  const files = new Set();
  for (const root of [...roots, "apps/api/database/migrations"]) {
    for (const file of await walk(join(repositoryRoot, root))) files.add(file);
  }
  const chunks = [];
  for (const file of files) chunks.push(await readFile(file, "utf8"));
  return chunks.join("\n").toLowerCase();
}

async function main() {
  invariant(registry.version === 1, "Unsupported CRUD registry version");
  invariant(registry.status === "authoritative", "CRUD registry must be authoritative");
  invariant(Array.isArray(registry.aggregates), "CRUD registry aggregates are missing");
  invariant(registry.aggregates.length >= 45, `CRUD registry contains only ${registry.aggregates.length} aggregates`);

  const ids = new Set();
  const domains = new Set();
  const implementedBulk = [];
  const summaries = [];

  for (const aggregate of registry.aggregates) {
    invariant(typeof aggregate.id === "string" && /^[a-z][a-z0-9.-]+$/.test(aggregate.id), `Invalid aggregate id: ${aggregate.id}`);
    invariant(!ids.has(aggregate.id), `Duplicate aggregate id: ${aggregate.id}`);
    ids.add(aggregate.id);
    domains.add(aggregate.domain);
    invariant(typeof aggregate.name === "string" && aggregate.name.length >= 3, `${aggregate.id} has no name`);
    invariant(typeof aggregate.lifecycle === "string" && aggregate.lifecycle.length >= 12, `${aggregate.id} has no lifecycle model`);
    invariant(!/[—]/.test(JSON.stringify(aggregate)), `${aggregate.id} contains a prohibited em dash`);
    invariant(Array.isArray(aggregate.sourceRoots) && aggregate.sourceRoots.length > 0, `${aggregate.id} has no source root`);
    invariant(Array.isArray(aggregate.testRoots) && aggregate.testRoots.length > 0, `${aggregate.id} has no test root`);
    invariant(Array.isArray(aggregate.evidenceTerms) && aggregate.evidenceTerms.length > 0, `${aggregate.id} has no implementation evidence term`);

    for (const path of [...aggregate.sourceRoots, ...aggregate.testRoots]) {
      invariant(await exists(join(repositoryRoot, path)), `${aggregate.id} references missing path ${path}`);
    }

    invariant(aggregate.operations && typeof aggregate.operations === "object", `${aggregate.id} has no operation decisions`);
    for (const key of operationKeys) {
      const decision = aggregate.operations[key];
      invariant(decision && operationDecisions.has(decision.decision), `${aggregate.id}.${key} has an invalid decision`);
      invariant(typeof decision.rationale === "string" && decision.rationale.length >= 20, `${aggregate.id}.${key} has no rationale`);
    }

    invariant(aggregate.operations.hardDelete.decision !== "implemented", `${aggregate.id} exposes destructive hard deletion`);
    if (/^(?:access|people|curriculum|assessment|credentials)\./.test(aggregate.id)) {
      invariant(aggregate.operations.hardDelete.decision === "prohibited", `${aggregate.id} must explicitly prohibit hard deletion`);
    }
    if (aggregate.operations.bulk.decision === "implemented") {
      implementedBulk.push(aggregate.id);
      invariant(/bounded|batch|atomic/i.test(aggregate.operations.bulk.rationale), `${aggregate.id} bulk rationale must describe bounded or atomic execution`);
    }
    if (aggregate.operations.transition.decision === "implemented") {
      invariant(aggregate.safeguards.audit === "required", `${aggregate.id} lifecycle transition must require audit evidence`);
      invariant(aggregate.safeguards.outbox === "required", `${aggregate.id} lifecycle transition must require outbox evidence`);
    }

    for (const [key, decision] of Object.entries(aggregate.safeguards)) {
      invariant(safeguardDecisions.has(decision), `${aggregate.id}.${key} has unsupported safeguard decision ${decision}`);
    }

    const corpus = await corpusFor(aggregate.sourceRoots);
    const matchedEvidenceTerms = aggregate.evidenceTerms.filter((term) => corpus.includes(String(term).toLowerCase()));
    invariant(
      matchedEvidenceTerms.length > 0,
      `${aggregate.id} has no implementation evidence match from: ${aggregate.evidenceTerms.join(", ")}`,
    );

    summaries.push({
      id: aggregate.id,
      domain: aggregate.domain,
      lifecycle: aggregate.lifecycle,
      bulk: aggregate.operations.bulk.decision,
      hardDelete: aggregate.operations.hardDelete.decision,
      matchedEvidenceTerms,
      sources: aggregate.sourceRoots.map((path) => repoPath(join(repositoryRoot, path))),
    });
  }

  for (const critical of [
    "foundation.tenant",
    "access.membership",
    "access.invitation",
    "people.person",
    "curriculum.programme-version",
    "delivery.enrolment",
    "assessment.submission-attempt",
    "assessment.mark",
    "credentials.issued-certificate",
    "credentials.export-job",
  ]) {
    invariant(ids.has(critical), `Critical managed aggregate is missing: ${critical}`);
  }
  invariant(implementedBulk.includes("people.person"), "People lifecycle bulk operation is missing");
  invariant(implementedBulk.includes("access.invitation"), "Invitation bulk revocation is missing");
  invariant(domains.size >= 10, `CRUD registry spans only ${domains.size} domains`);

  await mkdir(artifactRoot, { recursive: true });
  await writeFile(join(artifactRoot, "managed-aggregates.json"), `${JSON.stringify(registry, null, 2)}\n`);
  await writeFile(join(artifactRoot, "lifecycle-summary.json"), `${JSON.stringify({
    aggregateCount: registry.aggregates.length,
    domainCount: domains.size,
    implementedBulk,
    destructiveHardDeleteCount: 0,
    aggregates: summaries,
  }, null, 2)}\n`);
  process.stdout.write(`CRUD lifecycle gate validated ${registry.aggregates.length} aggregates across ${domains.size} domains.\n`);
}

await main();
