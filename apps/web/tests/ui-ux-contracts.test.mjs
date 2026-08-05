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

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("global stylesheet imports resolve to real files", () => {
  const globals = read("apps/web/app/globals.css");
  const imports = [...globals.matchAll(/@import\s+"([^"]+)";/g)].map((match) => match[1]);
  const localImports = imports.filter((value) => value.startsWith("../"));

  assert.ok(localImports.length >= 24, "all application style domains should be explicitly loaded");

  for (const imported of localImports) {
    const absolutePath = path.resolve(webRoot, "app", imported);
    assert.equal(fs.existsSync(absolutePath), true, `missing stylesheet import: ${imported}`);
  }

  const required = [
    "../styles/reset.css",
    "../styles/shell.css",
    "../styles/workspace-states.css",
    "../styles/command-search.css",
    "../styles/foundation.css",
    "../styles/dashboard-primary.css",
    "../styles/dashboard-secondary.css",
    "../styles/admin-platform.css",
    "../styles/institution-setup.css",
    "../styles/storage-administration.css",
    "../styles/people-workspace.css",
    "../styles/person-administration.css",
    "../styles/person-record.css",
    "../styles/terminology-workspace.css",
    "../styles/catalogue-governance.css",
    "../styles/catalogue-workspace.css",
    "../styles/learning-platform.css",
    "../styles/learning-platform-completion.css",
    "../styles/learner-progress.css",
    "../styles/communications.css",
    "../styles/evidence-room.css",
    "../styles/auth.css",
    "../styles/responsive.css",
    "../styles/ux-hardening.css",
  ];

  for (const stylesheet of required) {
    assert.match(globals, new RegExp(escapePattern(stylesheet)));
  }
});

test("shared brand tokens use one teal action system", () => {
  const tokens = read("packages/ui/src/tokens.css");
  assert.match(tokens, /--veza-brand:\s*#0d9488/);
  assert.match(tokens, /--veza-brand-strong:\s*#0f766e/);
  assert.match(tokens, /--veza-learning:\s*var\(--veza-brand\)/);
  assert.match(tokens, /--veza-violet:\s*var\(--veza-brand\)/);
  assert.match(tokens, /--veza-information:\s*#2563eb/);
  assert.match(tokens, /--veza-shadow-panel:\s*none/);
});

test("audited surfaces avoid prohibited visual shortcuts", () => {
  const auditedFiles = [
    "apps/web/src/components/app-shell.tsx",
    "apps/web/src/components/command-search.tsx",
    "apps/web/src/features/dashboard/dashboard-overview.tsx",
    "apps/web/src/features/dashboard/learning-overview.tsx",
    "apps/web/src/features/dashboard/course-grid.tsx",
    "apps/web/src/features/learner/learner-progress-workspace.tsx",
    "apps/web/src/features/workspace/navigation.ts",
    "apps/web/app/learning/page.tsx",
    "apps/web/app/assessments/page.tsx",
    "apps/web/app/insights/page.tsx",
    "apps/web/styles/shell.css",
    "apps/web/styles/workspace-states.css",
    "apps/web/styles/command-search.css",
    "apps/web/styles/foundation.css",
    "apps/web/styles/dashboard-primary.css",
    "apps/web/styles/dashboard-secondary.css",
    "apps/web/styles/learner-progress.css",
    "apps/web/styles/person-administration.css",
    "apps/web/styles/auth.css",
    "apps/web/styles/responsive.css",
    "apps/web/styles/ux-hardening.css",
  ];

  const source = auditedFiles.map(read).join("\n");
  assert.doesNotMatch(source, /[✦✨🌟]/u, "sparkle glyphs are not part of the Veza icon language");
  assert.doesNotMatch(source, /backdrop-filter/i, "blur is not part of the approved application visual system");
  assert.doesNotMatch(source, /href=["']#["']/, "navigation must resolve to a real task destination");
  assert.doesNotMatch(source, /#(?:7c6ef7|4f46e5|7867f8|6659dc|6254d6|8276ff|5b21b6)/i, "purple presentation colours are prohibited");
  assert.doesNotMatch(source, /—/u, "em dash characters are prohibited");
});

test("learner routes are role-safe and evidence-led", () => {
  const navigation = read("apps/web/src/features/workspace/navigation.ts");
  const learningPage = read("apps/web/app/learning/page.tsx");
  const insightsPage = read("apps/web/app/insights/page.tsx");
  const assessmentPage = read("apps/web/app/assessments/page.tsx");
  const overview = read("apps/web/src/features/dashboard/learning-overview.tsx");

  assert.match(learningPage, /role === "learner"/);
  assert.match(learningPage, /loadLearnerToday/);
  assert.match(insightsPage, /LearnerProgressWorkspace/);
  assert.match(insightsPage, /role === "guardian-sponsor"/);
  assert.match(assessmentPage, /active="assess"/);
  assert.match(navigation, /href: "\/assessments"/);
  assert.doesNotMatch(navigation, /"moderator", "learner"/);
  assert.doesNotMatch(overview, /href="\/assessments"/);
  assert.doesNotMatch(overview, /href="\/today"/);
});

test("learner dashboard exposes decision hierarchy and metric context", () => {
  const overview = read("apps/web/src/features/dashboard/learning-overview.tsx");
  const dashboard = read("apps/web/src/features/dashboard/dashboard-overview.tsx");
  const progress = read("apps/web/src/features/learner/learner-progress-workspace.tsx");

  assert.match(overview, /Continue learning/);
  assert.match(overview, /Updated today from published completion and released result records/);
  assert.match(overview, /Estimated effort/);
  assert.match(dashboard, /Days with at least one completed learning activity this term/);
  assert.match(progress, /Only published lessons and recorded completion evidence are included/);
});

test("responsive layout preserves explicit task order", () => {
  const responsive = read("apps/web/styles/responsive.css");
  const progress = read("apps/web/styles/learner-progress.css");
  const hardening = read("apps/web/styles/ux-hardening.css");

  assert.match(responsive, /grid-template-areas:\s*"continue"\s*"deadline"\s*"next"\s*"progress"/s);
  assert.match(responsive, /\.vz-course-shell[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(progress, /@media \(max-width: 720px\)/);
  assert.match(hardening, /@media \(max-width: 1040px\)/);
  assert.match(hardening, /\.catalogue-actions[\s\S]*position:\s*static/);
});
