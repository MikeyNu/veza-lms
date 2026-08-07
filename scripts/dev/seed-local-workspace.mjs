/**
 * Seeds the minimum records a local sign-in needs: a user matching the local
 * OIDC provider's subject, an active tenant, an institution, a membership and
 * a full set of tenant-scoped role assignments.
 *
 * Development only. Run against a migrated local database.
 */
import pg from "pg";

const { Pool } = pg;
// Tenant tables enforce row-level security keyed on app.current_tenant_id(),
// which no runtime role can satisfy while creating the tenant itself. Seeding
// therefore needs the bootstrap superuser (BYPASSRLS).
const connectionString =
  process.env.SEED_DATABASE_URL ?? "postgresql://veza_bootstrap:veza_bootstrap@localhost:5432/veza";

const issuer = process.env.OIDC_ISSUER_URL ?? "http://localhost:4500/";
const subject = process.env.SEED_SUBJECT ?? "dev-tenant-owner";
const email = process.env.SEED_EMAIL ?? "owner@akha.example";
const displayName = process.env.SEED_DISPLAY_NAME ?? "Thandi Mokoena";
const tenantSlug = process.env.SEED_TENANT_SLUG ?? "akha-academy";

/** Every module, so no screen is hidden behind a missing entitlement. */
const modules = [
  "core",
  "studio-pro",
  "exams",
  "commerce",
  "advanced-analytics",
  "credentials",
  "guardian-portal",
  "ai-assist",
  "integration-hub",
];

const roles = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "auditor",
  "support-agent",
  "learner",
];

const pool = new Pool({ connectionString, application_name: "veza-dev-seed", max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const user = (
    await client.query(
      `INSERT INTO users (identity_issuer, identity_subject, email, display_name, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (identity_issuer, identity_subject)
       DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = now()
       RETURNING id`,
      [issuer, subject, email, displayName],
    )
  ).rows[0];

  const tenant = (
    await client.query(
      `INSERT INTO tenants (slug, display_name, legal_name, status, deployment_tier,
                            residency_region, plan_key, locale, timezone, created_by,
                            branding_status, identity_provider_status)
       VALUES ($1, 'Akha Academy', 'Akha Academy NPC', 'active', 'shared',
               'af-south-1', 'growth', 'en-ZA', 'Africa/Johannesburg', $2,
               'verified', 'verified')
       ON CONFLICT (slug)
       DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id`,
      [tenantSlug, user.id],
    )
  ).rows[0];

  const institution = (
    await client.query(
      `INSERT INTO institutions (tenant_id, code, display_name, legal_name, institution_type,
                                 status, locale, timezone, contact_email, created_by)
       VALUES ($1, 'MAIN', 'Akha Academy Main Campus', 'Akha Academy NPC', 'university',
               'active', 'en-ZA', 'Africa/Johannesburg', $2, $3)
       ON CONFLICT (tenant_id, code)
       DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id`,
      [tenant.id, email, user.id],
    )
  ).rows[0];

  for (const moduleKey of modules) {
    await client.query(
      `INSERT INTO tenant_entitlements (tenant_id, module_key, state)
       VALUES ($1, $2, 'enabled')
       ON CONFLICT (tenant_id, module_key)
       DO UPDATE SET state = 'enabled', valid_until = NULL, updated_at = now()`,
      [tenant.id, moduleKey],
    );
  }

  const membership = (
    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, status, locale, timezone)
       VALUES ($1, $2, 'active', 'en-ZA', 'Africa/Johannesburg')
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id`,
      [tenant.id, user.id],
    )
  ).rows[0];

  // The learner screens resolve the signed-in identity to a person record with
  // an active learner profile; without it /today fails with
  // "Authenticated identity is not linked to an active learner profile".
  // Tenant guard triggers resolve references through app.current_tenant_id(),
  // so the seed must run the remaining inserts inside the tenant's context.
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
  // app.protect_person_identity_link() reserves linked_user_id for the identity
  // acceptance workflow; the seed opts in explicitly for this transaction.
  await client.query("SELECT set_config('app.allow_person_identity_link', 'true', true)");
  const person = (
    await client.query(
      `INSERT INTO people (id, tenant_id, linked_user_id, preferred_name, legal_given_names,
                           legal_family_name, status, locale, created_by, updated_by)
       VALUES (gen_random_uuid(), $1, $2, 'Thandi', 'Thandi', 'Mokoena', 'active', 'en-ZA', $2, $2)
       ON CONFLICT (tenant_id, linked_user_id)
         WHERE linked_user_id IS NOT NULL AND status <> 'merged'
       DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id`,
      [tenant.id, user.id],
    )
  ).rows[0];

  await client.query(
    `INSERT INTO learner_profiles (person_id, tenant_id, institution_id, status, admission_date)
     VALUES ($1, $2, $3, 'active', current_date)
     ON CONFLICT (person_id)
     DO UPDATE SET status = 'active', institution_id = EXCLUDED.institution_id, updated_at = now()`,
    [person.id, tenant.id, institution.id],
  );

  for (const role of roles) {
    await client.query(
      `INSERT INTO role_assignments (tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by)
       VALUES ($1, $2, $3, 'tenant', $1, $4)
       ON CONFLICT DO NOTHING`,
      [tenant.id, membership.id, role, user.id],
    );
  }

  await client.query("COMMIT");
  process.stdout.write(
    [
      `user        ${user.id}  (${issuer}${subject})`,
      `tenant      ${tenant.id}  (${tenantSlug})`,
      `institution ${institution.id}`,
      `membership  ${membership.id}`,
      `roles       ${roles.length} tenant-scoped assignments`,
      `modules     ${modules.length} entitlements enabled`,
    ].join("\n") + "\n",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
