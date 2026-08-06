import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

const workspaceClients = [
  "academic-evidence-api.ts",
  "access-directory-api.ts",
  "audit-api.ts",
  "catalogue-api.ts",
  "communications-api.ts",
  "credential-definition-api.ts",
  "institution-setup-api.ts",
  "learning-platform-api.ts",
  "people-api.ts",
  "people-bulk-api.ts",
  "people-reference-api.ts",
  "service-account-api.ts",
  "storage-api.ts",
  "terminology-api.ts",
];

test("every tenant-scoped server client forwards a validated membership selector", async () => {
  for (const file of workspaceClients) {
    const client = await source(`../src/server/${file}`);
    const usesSharedTransport = /requestWorkspaceJson/.test(client);
    const ownsValidatedHeader =
      /membershipCookieName/.test(client) &&
      /x-veza-membership-id/.test(client) &&
      /uuid|membershipIdPattern/.test(client);
    assert.equal(
      usesSharedTransport || ownsValidatedHeader,
      true,
      `${file} does not provide validated workspace context`,
    );
    assert.doesNotMatch(client, /x-veza-tenant-id/, `${file} forwards an untrusted tenant id`);
  }
});

test("pre-workspace and external identity calls do not invent tenant context", async () => {
  const [workspace, invitation] = await Promise.all([
    source("../src/server/workspace-api.ts"),
    source("../src/server/invitation-api.ts"),
  ]);
  assert.match(workspace, /loadWorkspaceOptions/);
  assert.match(workspace, /loadWorkspaceSession/);
  assert.match(workspace, /"x-veza-membership-id": membershipId/);
  assert.doesNotMatch(workspace, /x-veza-tenant-id/);
  assert.match(invitation, /authorization: `Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(invitation, /x-veza-membership-id/);
  assert.doesNotMatch(invitation, /x-veza-tenant-id/);
});
