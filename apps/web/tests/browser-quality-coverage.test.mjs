import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("browser QA covers public, OIDC and workspace identity journeys", async () => {
  const browser = await source("../../../scripts/qa/browser-quality.py");
  for (const route of [
    "/sign-in",
    "/invitation?invitationId=",
    "/account-help",
    "/reset-password",
    "/select-workspace",
    "/access-pending",
    "/admin/institution-setup",
    "/admin/access",
  ]) {
    assert.match(browser, new RegExp(route.replace(/[/?]/g, "\\$&")));
  }
  assert.match(browser, /"public"/);
  assert.match(browser, /"oidc"/);
  assert.match(browser, /"workspace"/);
  assert.match(browser, /"chromium", "firefox", "webkit"/);
  assert.match(browser, /"desktop"/);
  assert.match(browser, /"mobile"/);
});

test("browser QA checks semantics, focus, overflow and local password non-collection", async () => {
  const browser = await source("../../../scripts/qa/browser-quality.py");
  assert.match(browser, /mainCount/);
  assert.match(browser, /h1Count/);
  assert.match(browser, /unnamedControls/);
  assert.match(browser, /nestedInteractiveCount/);
  assert.match(browser, /horizontalOverflow/);
  assert.match(browser, /passwordInputCount/);
  assert.match(browser, /keyboard_findings/);
  assert.match(browser, /Console error/);
  assert.match(browser, /Request failure/);
});

test("browser fixture provides deterministic institution and access records", async () => {
  const fixture = await source("../../../scripts/qa/browser-fixture-server.mjs");
  assert.match(fixture, /Quality Institute/);
  assert.match(fixture, /Michael Ndhlovu/);
  assert.match(fixture, /\/v1\/access-directory/);
  assert.match(fixture, /assessor@quality\.veza\.invalid/);
  assert.match(fixture, /tenant-owner/);
  assert.match(fixture, /registrar/);
});
