import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

async function loadModel() {
  const input = await source("../src/features/workspace/breadcrumb-model.ts");
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const navigation = [
  { key: "home", label: "Overview", href: "/", icon: "home" },
  { key: "people", label: "People", href: "/people", icon: "people" },
  { key: "learning", label: "Learning", href: "/learning", icon: "book" },
  { key: "studio", label: "Studio", href: "/studio", icon: "studio" },
  { key: "assess", label: "Assess", href: "/assessments", icon: "check" },
  { key: "evidence", label: "Evidence room", href: "/evidence", icon: "evidence" },
  { key: "admin", label: "Admin", href: "/admin/institution-setup", icon: "admin" },
];

test("workspace breadcrumbs preserve hierarchy and never expose dynamic identifiers", async () => {
  const { resolveBreadcrumbs } = await loadModel();
  assert.deepEqual(resolveBreadcrumbs("/", navigation), [{ label: "Overview" }]);
  assert.deepEqual(resolveBreadcrumbs("/studio", navigation), [
    { label: "Overview", href: "/" },
    { label: "Studio" },
  ]);
  assert.deepEqual(resolveBreadcrumbs("/people/00000000-0000-4000-8000-000000000123", navigation), [
    { label: "Overview", href: "/" },
    { label: "People", href: "/people" },
    { label: "Person record" },
  ]);
  assert.deepEqual(resolveBreadcrumbs("/studio/lessons/00000000-0000-4000-8000-000000000456", navigation).at(-1), {
    label: "Lesson editor",
  });
  assert.deepEqual(resolveBreadcrumbs("/admin/access", navigation), [
    { label: "Overview", href: "/" },
    { label: "Admin", href: "/admin/institution-setup" },
    { label: "Access administration" },
  ]);
});

test("breadcrumbs adapt to role-specific navigation and standalone identity routes", async () => {
  const { resolveBreadcrumbs } = await loadModel();
  const learnerNavigation = [
    { key: "home", label: "Today", href: "/", icon: "home" },
    { key: "learning", label: "My learning", href: "/learning", icon: "book" },
  ];
  assert.deepEqual(resolveBreadcrumbs("/courses/enrolment-id", learnerNavigation), [
    { label: "Today", href: "/" },
    { label: "My learning", href: "/learning" },
    { label: "Course room" },
  ]);
  assert.deepEqual(resolveBreadcrumbs("/sign-in"), [
    { label: "Veza LMS", href: "/" },
    { label: "Sign in" },
  ]);
  assert.deepEqual(resolveBreadcrumbs("/verify/ABC12345"), [
    { label: "Veza LMS", href: "/" },
    { label: "Credential verification" },
  ]);
});

async function pageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "api" ? [] : pageFiles(target);
    return entry.name === "page.tsx" ? [target] : [];
  }));
  return nested.flat();
}

test("every user-facing page receives the shared breadcrumb system", async () => {
  const appDirectory = path.resolve(new URL("../app", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
  const pages = await pageFiles(appDirectory);
  assert.ok(pages.length >= 30);
  for (const page of pages) {
    const contents = await readFile(page, "utf8");
    assert.match(
      contents,
      /<AppShell|<IdentityGateway|RouteBreadcrumbs/,
      `${path.relative(appDirectory, page)} does not receive breadcrumbs`,
    );
  }
});

test("breadcrumb markup and responsive styling preserve navigation semantics", async () => {
  const [component, shell, identity, css] = await Promise.all([
    source("../src/components/route-breadcrumbs.tsx"),
    source("../src/components/app-shell-client.tsx"),
    source("../src/components/identity/identity-gateway.tsx"),
    source("../styles/breadcrumbs.css"),
  ]);
  assert.match(component, /aria-label="Breadcrumb"/);
  assert.match(component, /aria-current=/);
  assert.match(component, /<Link href=/);
  assert.match(shell, /BreadcrumbFallback variant="workspace"/);
  assert.match(identity, /BreadcrumbFallback variant="identity"/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@media \(max-width: 700px\)/);
});
