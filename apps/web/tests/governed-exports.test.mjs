import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("governed export page follows the baseline export permission model", async () => {
  const [page, authz] = await Promise.all([
    source("../app/evidence/exports/page.tsx"),
    source("../../../packages/authz/src/index.ts"),
  ]);
  assert.match(page, /tenant-owner/);
  assert.match(page, /institution-admin/);
  assert.match(page, /registrar/);
  assert.doesNotMatch(page, /course-manager/);
  assert.doesNotMatch(page, /instructor/);
  assert.doesNotMatch(page, /assessor/);
  assert.doesNotMatch(page, /moderator/);
  assert.doesNotMatch(page, /auditor/);
  assert.match(authz, /exportManage: "export\.manage"/);
  assert.match(authz, /"tenant-owner"[\s\S]*permissions\.exportManage/);
  assert.match(authz, /"institution-admin"[\s\S]*permissions\.exportManage/);
  assert.match(authz, /registrar[\s\S]*permissions\.exportManage/);
});

test("governed export workspace exposes all implemented datasets and formats", async () => {
  const workspace = await source("../src/features/academic-evidence/governed-export-workspace.tsx");
  for (const type of ["transcript", "gradebook", "enrolments", "people", "analytics"]) {
    assert.match(workspace, new RegExp(`value="${type}"`));
  }
  for (const format of ["pdf", "csv", "json"]) {
    assert.match(workspace, new RegExp(`value="${format}"`));
  }
  assert.match(workspace, /\/api\/academic\/export/);
  assert.match(workspace, /router\.refresh\(\)/);
  assert.match(workspace, /SHA-256 verification/);
  assert.match(workspace, /\/api\/academic-exports\/\$\{id\}\/download/);
  assert.doesNotMatch(workspace, /objectKey/);
});

test("export download BFF derives tenant context from membership and forwards only safe headers", async () => {
  const route = await source("../app/api/academic-exports/[exportId]/download/route.ts");
  assert.match(route, /getWebOidcSession/);
  assert.match(route, /membershipCookieName/);
  assert.match(route, /x-veza-membership-id/);
  assert.doesNotMatch(route, /x-veza-tenant-id/);
  assert.match(route, /content-disposition/);
  assert.match(route, /x-veza-checksum-sha256/);
  assert.match(route, /x-content-type-options/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /x-veza-object-key/);
});

test("evidence room reveals governed exports only to export managers", async () => {
  const room = await source("../src/features/evidence/evidence-room.tsx");
  assert.match(room, /exportManagerRoles/);
  assert.match(room, /canManageExports/);
  assert.match(room, /href="\/evidence\/exports"/);
  assert.match(room, /canManageExports \?/);
});
