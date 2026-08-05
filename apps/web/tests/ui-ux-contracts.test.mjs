import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testsDirectory, "..");
const repoRoot = path.resolve(webRoot, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("global stylesheet imports resolve to real files", () => {
  const globals = read("apps/web/app/globals.css");
  const imports = [...globals.matchAll(/@import\s+"([^"]+)";/g)].map((match) => match[1]);

  const localImports = imports.filter((value) => value.startsWith("../"));
  assert.ok(localImports.length >= 20, "all application style domains should be explicitly loaded");

  for (const imported of localImports) {
    const absolutePath = path.resolve(webRoot, "app", imported);
    assert.equal(fs.existsSync(absolutePath), true, `missing stylesheet import: ${imported}`);
  }

  const required = [
    "../styles/shell.css",
    "../styles/command-search.css",
    "../styles/foundation.css",
    "../styles/dashboard-primary.css",
    "../styles/dashboard-secondary.css",
    "../styles/admin-platform.css",
    "../styles/institution-setup.css",
    "../styles/people-workspace.css",
    "../styles/terminology-workspace.css",
    "../styles/learning-platform.css",
    "../styles/communications.css",
    "../styles/evidence-room.css",
    "../styles/ux-hardening.css",
  ];

  for (const stylesheet of required) {
    assert.match(globals, new RegExp(stylesheet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("shared brand tokens use one teal action system", () => {
  const tokens = read("packages/ui/src/tokens.css");
  assert.match(tokens, /--veza-brand:\s*#0d9488/);
  assert.match(tokens, /--veza-brand-strong:\s*#0f766e/);
  assert.match(tokens, /--veza-learning:\s*var\(--veza-brand\)/);
  assert.match(tokens, /--veza-violet:\s*var\(--veza-brand\)/);
  assert.match(tokens, /--veza-information:\s*#2563eb/);
});

test("audited shell and learner surfaces avoid prohibited visual shortcuts", () => {
  const auditedFiles = [
    "apps/web/src/components/app-shell.tsx",
    "apps/web/src/components/command-search.tsx",
    "apps/web/src/features/dashboard/dashboard-overview.tsx",
    "apps/web/src/features/dashboard/learning-overview.tsx",
    "apps/web/src/features/dashboard/course-grid.tsx",
    "apps/web/styles/shell.css",
    "apps/web/styles/command-search.css",
    "apps/web/styles/foundation.css",
    "apps/web/styles/dashboard-primary.css",
    "apps/web/styles/dashboard-secondary.css",
    "apps/web/styles/responsive.css",
    "apps/web/styles/ux-hardening.css",
  ];

  const source = auditedFiles.map(read).join("\n");
  assert.doesNotMatch(source, /[✦✨🌟]/u, "sparkle glyphs are not part of the Veza icon language");
  assert.doesNotMatch(source, /backdrop-filter/i, "persistent and overlay blur is not part of the approved visual system");
  assert.doesNotMatch(source, /href=["']#["']/, "navigation must resolve to a real task destination");
  assert.doesNotMatch(source, /#(?:7c6ef7|4f46e5|7867f8|6659dc|6254d6|8276ff|5b21b6)/i, "purple presentation colours are prohibited");
  assert.doesNotMatch(source, /—/u, "em dash characters are prohibited");
});

test("learner dashboard exposes decision hierarchy and metric context", () => {
  const overview = read("apps/web/src/features/dashboard/learning-overview.tsx");
  const dashboard = read("apps/web/src/features/dashboard/dashboard-overview.tsx");

  assert.match(overview, /Continue learning/);
  assert.match(overview, /Updated today from published completion and released result records/);
  assert.match(overview, /Estimated effort/);
  assert.match(dashboard, /Days with at least one completed learning activity this term/);
});
