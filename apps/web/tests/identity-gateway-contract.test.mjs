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

test("identity gateway matches the approved Veza auth brand panel", () => {
  const component = read("apps/web/src/components/identity/identity-gateway.tsx");
  const styles = read("apps/web/styles/identity-reference.css");

  assert.match(component, /Teach\. Learn\. Grow\. Together\./);
  assert.match(component, /Veza LMS is the all-in-one learning platform/);
  assert.match(component, /\/assets\/veza_logo_white_text_horizontal\.png/);
  assert.doesNotMatch(component, /Learning operations that remain connected to their evidence/);
  assert.doesNotMatch(component, /ONE INSTITUTIONAL CONTEXT/);

  assert.match(styles, /url\("\/assets\/panel_background\.png"\)/);
  assert.match(styles, /background-position:\s*center bottom/);
  assert.match(styles, /\.identity-story-copy\s*\{[^}]*align-self:\s*flex-start/s);
  assert.match(styles, /\.identity-brand-rule/);
  assert.doesNotMatch(styles, /backdrop-filter/i);
});

test("identity reference layer wins over the legacy gateway composition", () => {
  const globals = read("apps/web/app/globals.css");
  const legacyStyles = read("apps/web/styles/identity-gateway.css");
  const referenceStyles = read("apps/web/styles/identity-reference.css");
  const legacyImport = globals.indexOf('@import "../styles/identity-gateway.css"');
  const referenceImport = globals.indexOf('@import "../styles/identity-reference.css"');

  assert.ok(legacyImport >= 0, "legacy identity controls must remain imported");
  assert.ok(referenceImport > legacyImport, "approved identity reference must load after legacy identity styles");
  assert.match(legacyStyles, /\.identity-story-copy\s*\{[^}]*align-self:\s*end/s);
  assert.match(referenceStyles, /\.identity-story-copy\s*\{[^}]*align-self:\s*flex-start/s);
});

test("identity and legacy auth shells are viewport bounded without clipping actions", () => {
  const styles = read("apps/web/styles/identity-reference.css");

  assert.match(styles, /\.identity-gateway[\s\S]*block-size:\s*100dvh/);
  assert.match(styles, /\.identity-gateway[\s\S]*overflow:\s*hidden/);
  assert.match(styles, /\.identity-action-panel[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.auth-page[\s\S]*block-size:\s*100dvh/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-height: 520px\) and \(min-width: 761px\)/);
  assert.equal(
    fs.existsSync(path.join(webRoot, "public/assets/panel_background.png")),
    true,
    "the supplied panel artwork must be served from the web public tree",
  );
});
