import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd(), "../..");
const appRoot = join(root, "apps/web/app");
const sourceRoots = [appRoot, join(root, "apps/web/src")];
const output = join(root, "apps/web/public/__veza_route_audit.json");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(?:tsx?|mjs|jsx?)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function normalise(path) {
  return path.split(sep).join("/");
}

function routeFromPage(path) {
  let route = normalise(relative(appRoot, dirname(path)));
  if (route === ".") return "/";
  route = route
    .split("/")
    .filter((part) => !/^\(.+\)$/.test(part))
    .map((part) => part.startsWith("[[...") ? `:${part.slice(5, -2)}*?`
      : part.startsWith("[...") ? `:${part.slice(4, -1)}*`
      : part.startsWith("[") ? `:${part.slice(1, -1)}`
      : part)
    .join("/");
  return `/${route}`;
}

function literals(source, pattern) {
  const values = new Set();
  for (const match of source.matchAll(pattern)) {
    const value = match[1];
    if (value?.startsWith("/")) values.add(value.split(/[?#]/)[0]);
  }
  return [...values].sort();
}

function rolesFromSource(source) {
  const known = [
    "tenant-owner", "institution-admin", "registrar", "curriculum-manager",
    "course-manager", "instructor", "assessor", "moderator", "learner",
    "guardian-sponsor", "auditor", "support-agent",
  ];
  const used = known.filter((role) => source.includes(`\"${role}\"`) || source.includes(`'${role}'`));
  return used;
}

const pageFiles = (await walk(appRoot)).filter((path) => /\/page\.tsx$/.test(normalise(path)));
const routes = [];
for (const path of pageFiles) {
  const source = await readFile(path, "utf8");
  routes.push({
    route: routeFromPage(path),
    file: normalise(relative(root, path)),
    rolesMentioned: rolesFromSource(source),
    hasNotFoundGuard: /\bnotFound\s*\(/.test(source),
    hasRedirect: /\bredirect\s*\(/.test(source),
    usesWorkspaceSession: /(?:require|resolve)WorkspaceSession/.test(source),
  });
}
routes.sort((a, b) => a.route.localeCompare(b.route));

const files = [];
for (const sourceRoot of sourceRoots) {
  files.push(...await walk(sourceRoot));
}

const links = [];
for (const path of files) {
  const source = await readFile(path, "utf8");
  const values = new Set([
    ...literals(source, /\bhref\s*=\s*["'`]([^"'`]+)["'`]/g),
    ...literals(source, /\b(?:redirect|router\.push|router\.replace)\s*\(\s*["'`]([^"'`]+)["'`]/g),
    ...literals(source, /\bhref\s*:\s*["'`]([^"'`]+)["'`]/g),
  ]);
  for (const href of values) {
    links.push({ href, file: normalise(relative(root, path)) });
  }
}
links.sort((a, b) => a.href.localeCompare(b.href) || a.file.localeCompare(b.file));

function routeRegex(route) {
  if (route === "/") return /^\/$/;
  const pattern = route.split("/").map((part) => {
    if (!part) return "";
    if (part.startsWith(":")) {
      if (part.endsWith("*?")) return "(?:/.*)?";
      if (part.endsWith("*")) return "/.+";
      return "/[^/]+";
    }
    return `/${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  }).join("");
  return new RegExp(`^${pattern}/?$`);
}

const unresolved = links.filter(({ href }) => {
  if (href.startsWith("/api/") || href.startsWith("/_next/")) return false;
  return !routes.some(({ route }) => routeRegex(route).test(href));
});

const report = {
  generatedAt: new Date().toISOString(),
  routeCount: routes.length,
  linkCount: links.length,
  unresolvedCount: unresolved.length,
  routes,
  links,
  unresolved,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Route audit: ${routes.length} routes, ${links.length} links, ${unresolved.length} unresolved literals.`);
