import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import catalogue from "../../qa/features/platform-features.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactRoot = join(repositoryRoot, "qa-artifacts", "features");
const ignoredDirectories = new Set(["node_modules", "dist", ".next", ".turbo", ".git", "coverage", "qa-artifacts"]);
const allowedStatuses = new Set(["implemented", "gap"]);
const allowedApplications = new Set(["web", "control-plane"]);
const criticalFeatureIds = new Set([
  "assignment-submission.start-individual-assignment-session",
  "assignment-submission.start-group-assignment-session",
  "credentials-analytics-exports.pdf-export-lifecycle",
  "identity-access.mfa-guard-for-privileged-actions",
  "institution-structure.tenant-activation",
]);
const requiredWorkerRuntimeEvidence = new Map([
  ["Transactional outbox publisher", "processOutbox(outboxRepository"],
  ["Notification intent dispatcher", "notificationDispatcher.processDue()"],
  ["Media processor", "mediaProcessor.processDue()"],
  ["Search projection publisher", "searchIndexPublisher.processDue()"],
  ["Webhook dispatcher", "webhookDispatcher.processDue()"],
  ["Governed export processor", "exportProcessor.processDue()"],
  ["Metric refresher", "metricRefresher.refreshDue()"],
  ["Schedule reconciler", "platformScheduleReconciler.reconcile()"],
  ["Worker heartbeat", "safeHeartbeat(heartbeat"],
  ["Export expiry schedule", 'scheduler.register("exports.expiry"'],
  ["SLO measurement schedule", 'scheduler.register("observability.slo-measurement"'],
  ["Alert evaluation schedule", 'scheduler.register("observability.alert-evaluation"'],
  ["API cleanup schedule", 'scheduler.register("api.runtime-cleanup"'],
]);

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

async function walk(root, predicate = () => true) {
  if (!(await exists(root))) return [];
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (predicate(path)) output.push(path);
    }
  }
  await visit(root);
  return output.sort();
}

function repoPath(path) {
  return relative(repositoryRoot, path).split(sep).join("/");
}

function decoratorArgument(line) {
  const quoted = line.match(/\(\s*["'`]([^"'`]*)["'`]\s*\)/);
  return quoted?.[1] ?? "";
}

function joinRoute(prefix, suffix) {
  const route = ["v1", prefix, suffix]
    .filter(Boolean)
    .join("/")
    .replaceAll(/\/+/g, "/")
    .replace(/^\//, "");
  return `/${route}`;
}

function dynamicRoute(path) {
  return path
    .replace(/\[\.\.\.([^\]]+)\]/g, "*$1")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/\([^/]+\)\//g, "");
}

async function controllerOperations() {
  const files = await walk(join(repositoryRoot, "apps", "api", "src"), (path) => path.endsWith(".controller.ts"));
  const operations = [];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);
    let prefix = "";
    let pending;
    for (const line of lines) {
      if (line.includes("@Controller")) prefix = decoratorArgument(line);
      const decorator = line.match(/^\s*@(Get|Post|Put|Patch|Delete)(?:\((.*)\))?/);
      if (decorator) {
        pending = { method: decorator[1].toUpperCase(), suffix: decoratorArgument(line) };
        continue;
      }
      if (!pending || line.trimStart().startsWith("@")) continue;
      const method = line.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
      if (!method) continue;
      operations.push({
        kind: "api-operation",
        id: `api:${pending.method}:${joinRoute(prefix, pending.suffix)}`,
        method: pending.method,
        route: joinRoute(prefix, pending.suffix),
        handler: method[1],
        source: repoPath(file),
      });
      pending = undefined;
    }
  }
  return operations;
}

async function applicationPages(appRoot, application) {
  const files = await walk(appRoot, (path) => path.endsWith(`${sep}page.tsx`));
  return files.map((file) => {
    const routePart = relative(appRoot, dirname(file)).split(sep).join("/");
    const route = dynamicRoute(`/${routePart === "." ? "" : routePart}`).replace(/\/$/, "") || "/";
    return {
      kind: "browser-page",
      id: `${application}:page:${route}`,
      application,
      route,
      source: repoPath(file),
    };
  });
}

async function bffRoutes(appRoot, application) {
  const files = await walk(appRoot, (path) => path.endsWith(`${sep}route.ts`));
  const routes = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const routePart = relative(appRoot, dirname(file)).split(sep).join("/");
    const route = dynamicRoute(`/${routePart === "." ? "" : routePart}`).replace(/\/$/, "") || "/";
    const methods = new Set();
    for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) methods.add(match[1]);
    for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) methods.add(match[1]);
    invariant(methods.size > 0, `BFF route ${repoPath(file)} does not expose a supported HTTP method`);
    for (const method of methods) {
      routes.push({
        kind: "bff-operation",
        id: `${application}:bff:${method}:${route}`,
        application,
        method,
        route,
        source: repoPath(file),
      });
    }
  }
  return routes;
}

async function workerCapabilities() {
  const files = await walk(join(repositoryRoot, "apps", "worker", "src"), (path) => path.endsWith(".ts") && !path.endsWith(".d.ts"));
  return files.map((file) => ({
    kind: "worker-capability",
    id: `worker:${repoPath(file).replace(/^apps\/worker\/src\//, "").replace(/\.ts$/, "")}`,
    source: repoPath(file),
  }));
}

async function validateWorkerRuntime() {
  const main = await readFile(join(repositoryRoot, "apps", "worker", "src", "main.ts"), "utf8");
  const evidence = [];
  for (const [capability, token] of requiredWorkerRuntimeEvidence) {
    invariant(main.includes(token), `Worker runtime is not wired for ${capability}`);
    evidence.push({ capability, token });
  }
  return evidence;
}

async function validateMigrationOrder() {
  const directory = join(repositoryRoot, "apps", "api", "database", "migrations");
  const migrations = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const ownership = migrations.indexOf("0038_aaa_system_schedule_ownership.sql");
  const media = migrations.indexOf("0038_media_storage_platform.sql");
  const exports = migrations.indexOf("0052_governed_document_exports.sql");
  const schedules = migrations.indexOf("0053_platform_schedule_reconciliation.sql");
  invariant(ownership >= 0 && ownership < media, "System schedule ownership must precede historical system schedules");
  invariant(exports >= 0 && exports < schedules, "Export schema must precede platform schedule reconciliation");
  return { ownership, media, exports, schedules };
}

async function validateCatalogue() {
  invariant(catalogue.version === 1, "Unsupported feature catalogue version");
  invariant(Array.isArray(catalogue.categories) && catalogue.categories.length >= 20, "Feature catalogue is unexpectedly small");
  const ids = new Set();
  const pathChecks = [];
  const gaps = [];
  const browserEntryPoints = [];
  let featureCount = 0;
  for (const category of catalogue.categories) {
    invariant(category.id && category.title && category.boundary, `Feature category is incomplete: ${JSON.stringify(category)}`);
    invariant(Array.isArray(category.features) && category.features.length > 0, `Feature category ${category.id} is empty`);
    invariant(Array.isArray(category.sources) && category.sources.length > 0, `Feature category ${category.id} has no implementation surface`);
    invariant(Array.isArray(category.tests) && category.tests.length > 0, `Feature category ${category.id} has no verification owner`);
    for (const path of [...category.sources, ...category.tests]) pathChecks.push({ category: category.id, path });
    for (const feature of category.features) {
      featureCount += 1;
      invariant(!ids.has(feature.id), `Duplicate feature id: ${feature.id}`);
      invariant(feature.id.startsWith(`${category.id}.`), `Feature ${feature.id} is outside its category namespace`);
      invariant(allowedStatuses.has(feature.status), `Feature ${feature.id} has unsupported status ${feature.status}`);
      invariant(!/[—]/.test(`${feature.name}${feature.note ?? ""}`), `Feature ${feature.id} contains a prohibited em dash`);
      if (feature.entryPoint !== undefined) {
        const application = feature.application ?? "web";
        invariant(feature.status === "implemented", `Gap feature ${feature.id} cannot declare an implemented browser entry point`);
        invariant(allowedApplications.has(application), `Feature ${feature.id} declares unsupported application ${application}`);
        invariant(typeof feature.entryPoint === "string" && feature.entryPoint.startsWith("/"), `Feature ${feature.id} has invalid browser entry point`);
        invariant(!feature.entryPoint.includes("?"), `Feature ${feature.id} entry point must not contain a query string`);
        browserEntryPoints.push({ featureId: feature.id, application, route: feature.entryPoint });
      }
      if (feature.status === "gap") gaps.push({ category: category.id, ...feature });
      ids.add(feature.id);
    }
  }
  invariant(featureCount >= 516, `Feature catalogue contains only ${featureCount} capabilities`);
  invariant(gaps.length === 0, `Feature catalogue contains unresolved gaps: ${gaps.map((gap) => gap.id).join(", ")}`);
  for (const id of criticalFeatureIds) invariant(ids.has(id), `Critical feature is missing from the catalogue: ${id}`);
  for (const item of pathChecks) {
    invariant(await exists(join(repositoryRoot, item.path)), `Feature category ${item.category} references missing path ${item.path}`);
  }
  return { featureCount, gaps, browserEntryPoints };
}

function validateBrowserEntryPoints(entryPoints, webPages, controlPages) {
  const pagesByApplication = new Map([
    ["web", new Set(webPages.map((page) => page.route))],
    ["control-plane", new Set(controlPages.map((page) => page.route))],
  ]);
  const validated = [];
  for (const entryPoint of entryPoints) {
    const routes = pagesByApplication.get(entryPoint.application);
    invariant(routes?.has(entryPoint.route), `Feature ${entryPoint.featureId} declares missing ${entryPoint.application} browser entry point ${entryPoint.route}`);
    validated.push(entryPoint);
  }
  return validated;
}

async function main() {
  const [{ featureCount, gaps, browserEntryPoints }, workerRuntimeEvidence, migrationOrder] = await Promise.all([
    validateCatalogue(),
    validateWorkerRuntime(),
    validateMigrationOrder(),
  ]);
  const [apiOperations, webPages, controlPages, webBff, controlBff, workers] = await Promise.all([
    controllerOperations(),
    applicationPages(join(repositoryRoot, "apps", "web", "app"), "web"),
    applicationPages(join(repositoryRoot, "apps", "control-plane", "app"), "control-plane"),
    bffRoutes(join(repositoryRoot, "apps", "web", "app"), "web"),
    bffRoutes(join(repositoryRoot, "apps", "control-plane", "app"), "control-plane"),
    workerCapabilities(),
  ]);
  const validatedBrowserEntryPoints = validateBrowserEntryPoints(browserEntryPoints, webPages, controlPages);
  const surfaces = [...apiOperations, ...webPages, ...controlPages, ...webBff, ...controlBff, ...workers];
  const surfaceIds = new Set();
  for (const surface of surfaces) {
    invariant(!surfaceIds.has(surface.id), `Duplicate discovered surface: ${surface.id}`);
    surfaceIds.add(surface.id);
  }
  invariant(apiOperations.length >= 100, `Only ${apiOperations.length} API operations were discovered`);
  invariant(webPages.length >= 20, `Only ${webPages.length} web pages were discovered`);
  invariant(controlPages.length >= 8, `Only ${controlPages.length} control-plane pages were discovered`);
  invariant(webBff.length >= 20, `Only ${webBff.length} web BFF operations were discovered`);
  invariant(workers.length >= 10, `Only ${workers.length} worker capabilities were discovered`);

  await mkdir(artifactRoot, { recursive: true });
  await writeFile(join(artifactRoot, "catalogue.json"), `${JSON.stringify(catalogue, null, 2)}\n`);
  await writeFile(join(artifactRoot, "discovered-surfaces.json"), `${JSON.stringify(surfaces, null, 2)}\n`);
  await writeFile(join(artifactRoot, "summary.json"), `${JSON.stringify({
    featureCount,
    categoryCount: catalogue.categories.length,
    gapCount: gaps.length,
    gaps,
    validatedBrowserEntryPoints,
    workerRuntimeEvidence,
    migrationOrder,
    discovered: {
      apiOperations: apiOperations.length,
      webPages: webPages.length,
      controlPlanePages: controlPages.length,
      webBffOperations: webBff.length,
      controlPlaneBffOperations: controlBff.length,
      workerCapabilities: workers.length,
      total: surfaces.length,
    },
  }, null, 2)}\n`);
  console.log(`Feature inventory validated: ${featureCount} capabilities, ${surfaces.length} implementation surfaces, ${validatedBrowserEntryPoints.length} browser entry points, ${workerRuntimeEvidence.length} wired worker capabilities, no declared gaps.`);
}

await main();
