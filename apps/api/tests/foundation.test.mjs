import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("API enables strict request validation", async () => {
  const main = await source("../src/main.ts");
  assert.match(main, /forbidNonWhitelisted: true/);
  assert.match(main, /setGlobalPrefix\("v1"\)/);
});

test("tenant context fails closed when absent", async () => {
  const context = await source("../src/platform/request-context/tenant-context.ts");
  assert.match(context, /Tenant context is required/);
  assert.match(context, /AsyncLocalStorage<RequestContext>/);
});

test("tenant identity is derived from an authorised membership", async () => {
  const middleware = await source("../src/modules/tenancy/tenant-request-context.middleware.ts");
  const repository = await source("../src/modules/identity-access/infrastructure/identity-session.repository.ts");
  assert.match(middleware, /x-veza-membership-id/);
  assert.doesNotMatch(middleware, /x-veza-tenant-id/);
  assert.match(repository, /m\.id = \$1/);
  assert.match(repository, /m\.user_id = \$2/);
  assert.match(repository, /m\.status = 'active'/);
});

test("tenant provisioning is idempotent and transactionally emits evidence", async () => {
  const provisioning = await source("../src/modules/tenant-entitlements/application/provision-tenant.service.ts");
  assert.match(provisioning, /provisioning_requests/);
  assert.match(provisioning, /request_hash/);
  assert.match(provisioning, /this\.audit\.append/);
  assert.match(provisioning, /this\.outbox\.append/);
  assert.match(provisioning, /The core module is mandatory/);
});

test("database migration enforces row-level tenant isolation", async () => {
  const migration = await source("../database/migrations/0001_tenant_identity_access.sql");
  assert.match(migration, /CREATE OR REPLACE FUNCTION app\.current_tenant_id/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
  assert.match(migration, /memberships_isolation/);
  assert.match(migration, /role_assignments_isolation/);
  assert.match(migration, /audit_events_isolation/);
});

test("invitation secrets are digested and encrypted before persistence or delivery", async () => {
  const tokens = await source("../src/modules/identity-access/security/invitation-token.service.ts");
  const invitations = await source("../src/modules/identity-access/application/membership-invitation.service.ts");
  assert.match(tokens, /sha256/);
  assert.match(tokens, /aes-256-gcm/);
  assert.match(invitations, /token_digest/);
  assert.match(invitations, /encryptedToken/);
  assert.doesNotMatch(invitations, /rawToken[^\n]*payload/);
});

test("audit inspection is permissioned, tenant-scoped and cursor paginated", async () => {
  const controller = await source("../src/modules/audit/http/audit-events.controller.ts");
  const query = await source("../src/modules/audit/application/audit-query.service.ts");
  assert.match(controller, /permissions\.auditRead/);
  assert.match(controller, /TenantMembershipGuard/);
  assert.match(query, /withTenantTransaction\(context\.tenantId/);
  assert.match(query, /ORDER BY occurred_at DESC, id DESC/);
  assert.match(query, /LIMIT \$\{limitParameter\}/);
  assert.match(query, /Audit cursor is invalid/);
  assert.doesNotMatch(query, /controlPlaneQuery/);
});

test("invitation verification uses constant-time digest comparison", async () => {
  const tokens = await source("../src/modules/identity-access/security/invitation-token.service.ts");
  const invitations = await source("../src/modules/identity-access/application/membership-invitation.service.ts");
  assert.match(tokens, /timingSafeEqual/);
  assert.match(tokens, /matches\(token: string, expectedDigest: string\)/);
  assert.match(invitations, /this\.tokens\.matches/);
});

test("database identities separate migration, application and control-plane authority", async () => {
  const migrationRunner = await source("../scripts/migrate.mjs");
  const migration = await source("../database/migrations/0001_tenant_identity_access.sql");
  assert.match(migrationRunner, /MIGRATION_DATABASE_URL/);
  assert.doesNotMatch(migrationRunner, /CONTROL_PLANE_DATABASE_URL \?\?/);
  assert.match(migration, /veza_app is always/);
  assert.match(migration, /GRANT SELECT, INSERT ON audit_events TO veza_control/);
  assert.doesNotMatch(migration, /ALTER DEFAULT PRIVILEGES[\s\S]*veza_app/);
});
