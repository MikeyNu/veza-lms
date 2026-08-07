import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("profile route is an authenticated workspace entry point", async () => {
  const page = await read("../app/profile/page.tsx");
  assert.match(page, /requireWorkspaceSession\(\)/);
  assert.match(page, /<AppShell session=\{session\}>/);
  assert.match(page, /Current workspace/);
  assert.match(page, /Communication preferences/);
  assert.match(page, /href="\/select-workspace"/);
  assert.match(page, /href="\/communicate#notification-preferences"/);
});

test("profile delegates credentials and MFA to the identity provider", async () => {
  const page = await read("../app/profile/page.tsx");
  assert.match(page, /identityProviderRecoveryUrl/);
  assert.match(page, /identityProviderSupportUrl/);
  assert.match(page, /Password, MFA, recovery codes and account lockouts remain with your institution's identity provider/);
  assert.doesNotMatch(page, /type="password"/);
  assert.doesNotMatch(page, /currentPassword|newPassword|mfaSecret|totpSecret/);
});

test("profile route supplies loading and recoverable error states", async () => {
  const [loading, error] = await Promise.all([
    read("../app/profile/loading.tsx"),
    read("../app/profile/error.tsx"),
  ]);
  assert.match(loading, /WorkspaceRouteLoading/);
  assert.match(error, /WorkspaceRouteError/);
});
