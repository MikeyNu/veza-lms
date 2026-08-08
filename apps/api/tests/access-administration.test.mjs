import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("role delegation uses an explicit bounded matrix rather than target-role permission cloning", async () => {
  const [delegation, authorization] = await Promise.all([
    source("../../../packages/authz/src/delegation.ts"),
    source("../src/platform/authorization/tenant-authorization.service.ts"),
  ]);
  assert.match(delegation, /tenant-owner/);
  assert.match(delegation, /institution-admin/);
  assert.match(delegation, /learner/);
  assert.match(delegation, /guardian-sponsor/);
  assert.doesNotMatch(delegation, /support-agent/);
  assert.match(authorization, /canDelegateRole/);
  assert.doesNotMatch(authorization, /permissionsForRoles/);
});

test("access-directory writes require MFA, scoped permission and delegation validation", async () => {
  const [controller, service] = await Promise.all([
    source("../src/modules/identity-access/http/access-directory.controller.ts"),
    source("../src/modules/identity-access/application/access-administration.service.ts"),
  ]);
  assert.match(controller, /@UseGuards\(MfaGuard\)/g);
  assert.match(controller, /buildInstitutionResource/);
  assert.match(service, /permissions\.membershipInvite/);
  assert.match(service, /permissions\.membershipRoleAssign/);
  assert.match(service, /assertCanDelegate/);
  assert.match(service, /The tenant must retain at least one active tenant owner/);
  assert.match(service, /pg_advisory_xact_lock/);
});

test("access mutations write audit and transactional outbox evidence", async () => {
  const service = await source("../src/modules/identity-access/application/access-administration.service.ts");
  assert.match(service, /membership\.role-assigned/);
  assert.match(service, /membership\.role-ended/);
  assert.match(service, /membership\.status-changed/);
  assert.match(service, /membership\.invitation\.revoked/);
  assert.match(service, /this\.audit\.append/g);
  assert.match(service, /this\.outbox\.append/g);
});

test("effective-dated role history permits reassignment but rejects overlap", async () => {
  const migration = await source("../database/migrations/0006_access_administration.sql");
  assert.match(migration, /DROP INDEX IF EXISTS role_assignments_unique_assignment_idx/);
  assert.match(migration, /role_assignments_no_overlapping_grant/);
  assert.match(migration, /tstzrange/);
  assert.match(migration, /end_reason/);
  assert.match(migration, /ended_by/);
});

test("invitation acceptance supports tenant and institution scopes without duplicating active roles", async () => {
  const service = await source("../src/modules/identity-access/application/membership-invitation.service.ts");
  assert.match(service, /"tenant" \| "institution"/);
  assert.match(service, /activeRole\.rowCount === 0/);
  assert.match(service, /scopeType: invitation\.scope_type/);
  assert.doesNotMatch(service, /ON CONFLICT \(tenant_id, membership_id, role_key, scope_type, scope_id\)/);
});
