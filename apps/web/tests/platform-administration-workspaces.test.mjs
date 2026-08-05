import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("media administration mounts every required governance control", async () => {
  const [page, workspace, api, bff] = await Promise.all([
    read("app/admin/storage/page.tsx"),
    read("src/features/admin/storage-administration-workspace.tsx"),
    read("src/server/storage-api.ts"),
    read("app/api/storage/[operation]/route.ts"),
  ]);
  assert.match(page, /StorageAdministrationWorkspace/);
  assert.match(workspace, /Create namespace/);
  assert.match(workspace, /Create policy/);
  assert.match(workspace, /Save quota policy/);
  assert.match(workspace, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(workspace, /Recording consent/);
  assert.match(workspace, /Accessibility evidence/);
  assert.match(workspace, /Request deletion/);
  assert.match(workspace, /Approve with MFA/);
  assert.match(api, /\/v1\/storage\/deletion-requests/);
  assert.match(api, /\/v1\/storage\/quota/);
  assert.match(bff, /isSameOriginRequest/);
  assert.match(bff, /parsed\.toISOString\(\)/);
});

test("service account administration preserves one-time secret semantics", async () => {
  const [page, workspace, api, bff] = await Promise.all([
    read("app/admin/service-accounts/page.tsx"),
    read("src/features/admin/service-account-workspace.tsx"),
    read("src/server/service-account-api.ts"),
    read("app/api/service-accounts/[operation]/route.ts"),
  ]);
  assert.match(page, /ServiceAccountWorkspace/);
  assert.match(workspace, /Secrets are shown once/);
  assert.match(workspace, /I have stored this credential/);
  assert.match(workspace, /Rotate secret/);
  assert.match(workspace, /Retire permanently/);
  assert.doesNotMatch(api, /secretHash|secretSalt/);
  assert.match(api, /rotate-secret/);
  assert.match(bff, /isSameOriginRequest/);
});

test("administration navigation exposes institution, storage and service account boundaries", async () => {
  const navigation = await read("src/features/admin/admin-section-navigation.tsx");
  assert.match(navigation, /\/admin\/institution-setup/);
  assert.match(navigation, /\/admin\/storage/);
  assert.match(navigation, /\/admin\/service-accounts/);
});
