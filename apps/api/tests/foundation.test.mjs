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
  const invitations = await source("../src/modules/identity-access/application/access-administration.service.ts");
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
  const [migrationRunner, migration, repair, localHelper] = await Promise.all([
    source("../scripts/migrate.mjs"),
    source("../database/migrations/0001_tenant_identity_access.sql"),
    source("../database/migrations/0058_runtime_least_privilege_repair.sql"),
    source("../../../scripts/dev/grant-local-privileges.mjs"),
  ]);
  assert.match(migrationRunner, /MIGRATION_DATABASE_URL/);
  assert.doesNotMatch(migrationRunner, /CONTROL_PLANE_DATABASE_URL \?\?/);
  assert.match(migration, /veza_app is always/);
  assert.match(migration, /GRANT SELECT, INSERT ON audit_events TO veza_control/);
  assert.doesNotMatch(migration, /ALTER DEFAULT PRIVILEGES[\s\S]*veza_app/);
  assert.match(repair, /REVOKE ALL PRIVILEGES ON ALL TABLES[\s\S]*veza_app/);
  assert.match(repair, /GRANT SELECT ON[\s\S]*TO veza_app/);
  assert.match(repair, /GRANT SELECT \(id, email, display_name, status\) ON users TO veza_app/);
  assert.match(repair, /alert_events, alert_rules[\s\S]*people[\s\S]*slo_definitions[\s\S]*studio_lessons[\s\S]*TO veza_worker/);
  assert.match(localHelper, /0058_runtime_least_privilege_repair\.sql/);
  assert.doesNotMatch(localHelper, /GRANT[\s\S]*ON ALL TABLES/);
});

test("workspace choices are resolved from the authenticated principal without tenant input", async () => {
  const repository = await source("../src/modules/identity-access/infrastructure/identity-session.repository.ts");
  const controller = await source("../src/modules/identity-access/http/principal-session.controller.ts");
  assert.match(repository, /WHERE m\.user_id = \$1/);
  assert.match(repository, /m\.status = 'active'/);
  assert.match(controller, /session.*workspaces/s);
  assert.doesNotMatch(controller, /tenantId/);
});

test("platform operators require role and configured MFA assurance before bootstrap", async () => {
  const repository = await source("../src/modules/identity-access/infrastructure/identity-session.repository.ts");
  const assurance = await source("../src/platform/authentication/platform-operator-assurance.ts");
  const guard = await source("../src/platform/authentication/platform-operator.guard.ts");
  assert.match(repository, /hasPlatformOperatorAssurance\(external\)/);
  assert.match(repository, /AND status = 'active'/);
  assert.match(repository, /ON CONFLICT \(identity_issuer, identity_subject\)/);
  assert.match(assurance, /PLATFORM_OPERATOR_REQUIRED_AMR/);
  assert.match(assurance, /platformRoles\.includes\(PLATFORM_OPERATOR_ROLE\)/);
  assert.match(assurance, /authenticationMethods\.includes/);
  assert.match(guard, /hasPlatformOperatorAssurance\(request\.principal\)/);
});

test("platform-operator identity bootstrap creates global audit evidence", async () => {
  const migration = await source("../database/migrations/0002_platform_operator_audit.sql");
  const repository = await source("../src/modules/identity-access/infrastructure/identity-session.repository.ts");
  assert.match(migration, /CREATE TABLE platform_audit_events/);
  assert.match(migration, /GRANT SELECT, INSERT ON platform_audit_events TO veza_control/);
  assert.match(repository, /platform-operator\.identity-created/);
  assert.match(repository, /correlationId/);
});

test("institution structure tables are tenant-owned and forced through RLS", async () => {
  const migration = await source("../database/migrations/0003_institution_structure_and_activation.sql");
  for (const table of ["tenant_setup_profiles", "institutions", "campuses", "organisational_units", "academic_periods", "institutional_policies"]) {
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`${table}_isolation`));
  }
  assert.match(migration, /campuses_one_primary_active_idx/);
  assert.match(migration, /protect_published_academic_period/);
  assert.match(migration, /protect_approved_institutional_policy/);
});

test("institution setup preserves hierarchy and policy version invariants", async () => {
  const service = await source("../src/modules/institution-structure/application/institution-structure.service.ts");
  assert.match(service, /Child academic period must remain inside the parent period/);
  assert.match(service, /Publish the parent academic period before publishing this child period/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /const version = \(active\?\.version \?\? 0\) \+ 1/);
  assert.match(service, /content_checksum/);
  assert.match(service, /Replacement policy must take effect after the current approved version/);
  assert.match(service, /this\.record/);
});

test("tenant activation is computed from durable institution facts", async () => {
  const activation = await source("../src/modules/institution-structure/application/tenant-activation.service.ts");
  assert.match(activation, /tenant_setup_profiles/);
  assert.match(activation, /module_key = 'core'/);
  assert.match(activation, /role_key = 'tenant-owner'/);
  assert.match(activation, /c\.is_primary = true/);
  assert.match(activation, /ap\.status = 'published'/);
  assert.match(activation, /safeguarding/);
  assert.match(activation, /WHERE id = \$1 AND status = 'provisioning'/);
  assert.match(activation, /tenant\.activated/);
});

test("learner home links resolve to implemented workspace routes", async () => {
  const service = await source("../src/modules/learner-course/application/learner-course.service.ts");
  assert.match(service, /href: `\/courses\/\$\{enrolment\.enrolmentId\}`/);
  assert.match(service, /href: "\/calendar"/);
  assert.doesNotMatch(service, /\/courses\/\$\{enrolment\.enrolmentId\}\/lessons\//);
  assert.doesNotMatch(service, /\/courses\/\$\{event\.courseRunId\}\/calendar/);
});

test("high-consequence institution actions require MFA and scoped permission", async () => {
  const controller = await source("../src/modules/institution-structure/http/institution-setup.controller.ts");
  const authz = await source("../../../packages/authz/src/index.ts");
  assert.match(controller, /@Post\("institutions\/:institutionId\/academic-periods\/:periodId\/publish"\)\n  @UseGuards\(MfaGuard\)/);
  assert.match(controller, /@Post\("institutions\/:institutionId\/policies\/approve"\)\n  @UseGuards\(MfaGuard\)/);
  assert.match(controller, /@Post\("activate"\)[\s\S]*@UseGuards\(TenantPermissionGuard, MfaGuard\)/);
  assert.match(controller, /type: "institution"/);
  assert.match(controller, /ancestors: \[\{ type: "tenant", id: tenantId \}\]/);
  assert.match(authz, /academicPeriodManage: "academic-period\.manage"/);
  assert.match(authz, /institutionalPolicyApprove: "institutional-policy\.approve"/);
});
