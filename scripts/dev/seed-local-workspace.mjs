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
const email = process.env.SEED_EMAIL ?? "owner@candy.example";
const displayName = process.env.SEED_DISPLAY_NAME ?? "Thandi Mokoena";
const tenantSlug = process.env.SEED_TENANT_SLUG ?? "candy-academy";
const tenantDisplayName = process.env.SEED_TENANT_DISPLAY_NAME ?? "Candy";
const tenantLegalName = process.env.SEED_TENANT_LEGAL_NAME ?? "Candy";

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
       VALUES ($1, $2, $3, 'active', 'shared',
               'af-south-1', 'growth', 'en-ZA', 'Africa/Johannesburg', $4,
               'verified', 'verified')
       ON CONFLICT (slug)
       DO UPDATE SET display_name = EXCLUDED.display_name,
                     legal_name = EXCLUDED.legal_name,
                     status = 'active', updated_at = now()
       RETURNING id`,
      [tenantSlug, tenantDisplayName, tenantLegalName, user.id],
    )
  ).rows[0];

  const institution = (
    await client.query(
      `INSERT INTO institutions (tenant_id, code, display_name, legal_name, institution_type,
                                 status, locale, timezone, contact_email, created_by)
       VALUES ($1, 'MAIN', $2, $3, 'university',
               'active', 'en-ZA', 'Africa/Johannesburg', $4, $5)
       ON CONFLICT (tenant_id, code)
       DO UPDATE SET display_name = EXCLUDED.display_name,
                     legal_name = EXCLUDED.legal_name,
                     status = 'active', updated_at = now()
       RETURNING id`,
      [tenant.id, tenantDisplayName, tenantLegalName, email, user.id],
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

  const learnerUser = (
    await client.query(
      `INSERT INTO users (identity_issuer, identity_subject, email, display_name, status)
       VALUES ($1, 'dev-learner', 'learner@candy.example', 'Candy Learner', 'active')
       ON CONFLICT (identity_issuer, identity_subject)
       DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
                     status = 'active', updated_at = now()
       RETURNING id`,
      [issuer],
    )
  ).rows[0];

  const learnerMembership = (
    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, status, locale, timezone)
       VALUES ($1, $2, 'active', 'en-ZA', 'Africa/Johannesburg')
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id`,
      [tenant.id, learnerUser.id],
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

  await client.query("DELETE FROM role_assignments WHERE membership_id = $1", [
    learnerMembership.id,
  ]);
  await client.query(
    `INSERT INTO role_assignments (
       tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
     ) VALUES ($1, $2, 'learner', 'tenant', $1, $3)
     ON CONFLICT DO NOTHING`,
    [tenant.id, learnerMembership.id, user.id],
  );

  // Seed a small but connected academic journey so local browser testing can
  // exercise real course-room, gradebook and Studio detail routes.
  const additionalLearner = (
    await client.query(
      `INSERT INTO people (
         id, tenant_id, linked_user_id, preferred_name, legal_given_names, legal_family_name,
         status, locale, source_system, source_reference, created_by, updated_by
       ) VALUES (
         gen_random_uuid(), $1, $2, 'Candy', 'Candy', 'Learner', 'active', 'en-ZA',
         'local-seed', 'learner-001', $3, $3
       )
       ON CONFLICT (tenant_id, source_system, source_reference)
       DO UPDATE SET linked_user_id = EXCLUDED.linked_user_id,
                     preferred_name = EXCLUDED.preferred_name,
                     legal_given_names = EXCLUDED.legal_given_names,
                     legal_family_name = EXCLUDED.legal_family_name,
                     status = 'active', updated_at = now()
       RETURNING id`,
      [tenant.id, learnerUser.id, user.id],
    )
  ).rows[0];

  await client.query(
    `INSERT INTO learner_profiles (person_id, tenant_id, institution_id, status, admission_date)
     VALUES ($1, $2, $3, 'active', current_date)
     ON CONFLICT (person_id)
     DO UPDATE SET status = 'active', institution_id = EXCLUDED.institution_id, updated_at = now()`,
    [additionalLearner.id, tenant.id, institution.id],
  );

  const academicPeriod = (
    await client.query(
      `INSERT INTO academic_periods (
         tenant_id, institution_id, code, display_name, period_type, status,
         starts_on, ends_on, teaching_starts_on, teaching_ends_on, timezone,
         created_by, published_by, published_at
       ) VALUES (
         $1, $2, 'LOCAL-2026', 'Local testing year 2026', 'academic-year', 'published',
         DATE '2026-01-01', DATE '2026-12-31', DATE '2026-01-12', DATE '2026-12-11',
         'Africa/Johannesburg', $3, $3, now()
       )
       ON CONFLICT (tenant_id, institution_id, code)
       DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [tenant.id, institution.id, user.id],
    )
  ).rows[0];

  const courseDefinition = (
    await client.query(
      `INSERT INTO course_definitions (
         id, tenant_id, institution_id, code, title, subject_area, status, created_by
       ) VALUES (
         gen_random_uuid(), $1, $2, 'DATA101', 'Data Literacy Foundations',
         'Digital literacy', 'active', $3
       )
       ON CONFLICT (tenant_id, institution_id, code)
       DO UPDATE SET status = 'active'
       RETURNING id`,
      [tenant.id, institution.id, user.id],
    )
  ).rows[0];

  let blueprint = (
    await client.query(
      `SELECT id FROM course_blueprint_versions
       WHERE tenant_id = $1 AND course_definition_id = $2 AND version_number = 1`,
      [tenant.id, courseDefinition.id],
    )
  ).rows[0];
  if (!blueprint) {
    blueprint = (
      await client.query(
        `INSERT INTO course_blueprint_versions (
           id, tenant_id, institution_id, course_definition_id, version_number,
           lifecycle, title, description, credit_value, notional_hours,
           delivery_modes, effective_from, approved_by, approved_at, approval_notes,
           created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, 1, 'approved', 'Data Literacy Foundations',
           'A governed local course used to verify learning, assessment and evidence journeys.',
           12, 120, ARRAY['blended'], DATE '2026-01-01', $4, now(),
           'Approved local testing fixture', $4, $4
         ) RETURNING id`,
        [tenant.id, institution.id, courseDefinition.id, user.id],
      )
    ).rows[0];
  }

  let courseRun = (
    await client.query(
      `SELECT id FROM course_runs
       WHERE tenant_id = $1 AND institution_id = $2 AND code = 'DATA101-LOCAL-2026'`,
      [tenant.id, institution.id],
    )
  ).rows[0];
  if (!courseRun) {
    courseRun = (
      await client.query(
        `INSERT INTO course_runs (
           id, tenant_id, institution_id, academic_period_id,
           course_blueprint_version_id, code, title, delivery_mode,
           starts_on, ends_on, capacity, lifecycle, created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, 'DATA101-LOCAL-2026',
           'Data Literacy Foundations', 'blended', DATE '2026-07-01', DATE '2026-11-30',
           40, 'in_progress', $5, $5
         ) RETURNING id`,
        [tenant.id, institution.id, academicPeriod.id, blueprint.id, user.id],
      )
    ).rows[0];
  }

  async function seedEnrolment(learnerPersonId) {
    const current = (
      await client.query(
        `SELECT id FROM enrolments
         WHERE tenant_id = $1 AND learner_person_id = $2 AND course_run_id = $3
           AND effective_until IS NULL AND status NOT IN ('cancelled', 'withdrawn')`,
        [tenant.id, learnerPersonId, courseRun.id],
      )
    ).rows[0];
    if (current) return current;
    return (
      await client.query(
        `INSERT INTO enrolments (
           id, tenant_id, institution_id, learner_person_id, course_run_id,
           status, enrolled_on, source, eligibility_snapshot, created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, 'active', DATE '2026-06-15',
           'manual', '{"source":"local-seed","eligible":true}'::jsonb, $5, $5
         ) RETURNING id`,
        [tenant.id, institution.id, learnerPersonId, courseRun.id, user.id],
      )
    ).rows[0];
  }

  const enrolment = await seedEnrolment(person.id);
  await seedEnrolment(additionalLearner.id);

  let courseSpace = (
    await client.query(
      `SELECT id FROM studio_course_spaces
       WHERE tenant_id = $1 AND course_blueprint_version_id = $2`,
      [tenant.id, blueprint.id],
    )
  ).rows[0];
  if (!courseSpace) {
    courseSpace = (
      await client.query(
        `INSERT INTO studio_course_spaces (
           id, tenant_id, institution_id, course_blueprint_version_id,
           title, status, created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, 'Data Literacy Foundations',
           'published', $4, $4
         ) RETURNING id`,
        [tenant.id, institution.id, blueprint.id, user.id],
      )
    ).rows[0];
  }

  let studioModule = (
    await client.query(
      `SELECT id FROM studio_modules
       WHERE tenant_id = $1 AND course_space_id = $2 AND sequence_number = 1`,
      [tenant.id, courseSpace.id],
    )
  ).rows[0];
  if (!studioModule) {
    studioModule = (
      await client.query(
        `INSERT INTO studio_modules (
           id, tenant_id, institution_id, course_space_id, title, description,
           sequence_number, status, created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, 'Working with evidence',
           'Learn to distinguish observations, interpretations and supported claims.',
           1, 'active', $4, $4
         ) RETURNING id`,
        [tenant.id, institution.id, courseSpace.id, user.id],
      )
    ).rows[0];
  }

  let lesson = (
    await client.query(
      `SELECT id FROM studio_lessons
       WHERE tenant_id = $1 AND module_id = $2 AND sequence_number = 1`,
      [tenant.id, studioModule.id],
    )
  ).rows[0];
  if (!lesson) {
    lesson = (
      await client.query(
        `INSERT INTO studio_lessons (
           id, tenant_id, institution_id, course_space_id, module_id, title,
           summary, sequence_number, lesson_type, estimated_minutes, status,
           completion_rule, created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, 'Reading a dataset critically',
           'Separate observation, interpretation and claim before drawing a conclusion.',
           1, 'lesson', 35, 'published', '{"type":"view"}'::jsonb, $5, $5
         ) RETURNING id`,
        [tenant.id, institution.id, courseSpace.id, studioModule.id, user.id],
      )
    ).rows[0];
  }

  let revision = (
    await client.query(
      `SELECT id FROM studio_lesson_revisions
       WHERE tenant_id = $1 AND lesson_id = $2 AND revision_number = 1`,
      [tenant.id, lesson.id],
    )
  ).rows[0];
  if (!revision) {
    revision = (
      await client.query(
        `INSERT INTO studio_lesson_revisions (
           id, tenant_id, institution_id, lesson_id, revision_number,
           block_document, checksum_sha256, change_summary, accessibility_report,
           link_report, reading_metrics, created_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, 1,
           '[{"id":"local-heading","type":"heading","data":{"text":"Evidence before conclusions","level":2}},{"id":"local-body","type":"paragraph","data":{"text":"Record what the data shows before interpreting why it happened."}}]'::jsonb,
           repeat('a', 64), 'Initial local testing lesson revision',
           '{"status":"pass","findings":[]}'::jsonb, '{"status":"pass","findings":[]}'::jsonb,
           '{"estimatedMinutes":35}'::jsonb, $4
         ) RETURNING id`,
        [tenant.id, institution.id, lesson.id, user.id],
      )
    ).rows[0];
    await client.query(
      `UPDATE studio_lessons SET current_revision_id = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenant.id, lesson.id, revision.id],
    );
  }

  let contractRevision = (
    await client.query(
      `SELECT id FROM studio_lesson_revisions
       WHERE tenant_id = $1 AND lesson_id = $2 AND checksum_sha256 = repeat('b', 64)`,
      [tenant.id, lesson.id],
    )
  ).rows[0];
  if (!contractRevision) {
    const nextRevision = (
      await client.query(
        `SELECT COALESCE(max(revision_number), 0) + 1 next_revision
         FROM studio_lesson_revisions WHERE tenant_id = $1 AND lesson_id = $2`,
        [tenant.id, lesson.id],
      )
    ).rows[0];
    contractRevision = (
      await client.query(
        `INSERT INTO studio_lesson_revisions (
           id, tenant_id, institution_id, lesson_id, revision_number,
           based_on_revision_id, block_document, checksum_sha256, change_summary,
           accessibility_report, link_report, reading_metrics, created_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5,
           '[{"id":"local-heading","type":"heading","data":{"text":"Evidence before conclusions","level":2}},{"id":"local-body","type":"paragraph","data":{"text":"Record what the data shows before interpreting why it happened."}}]'::jsonb,
           repeat('b', 64), 'Align local revision with browser response contracts',
           '{"status":"pass","findings":[]}'::jsonb,
           '{"status":"pass","findings":[]}'::jsonb,
           '{"estimatedMinutes":35}'::jsonb, $6
         ) RETURNING id`,
        [
          tenant.id,
          institution.id,
          lesson.id,
          Number(nextRevision.next_revision),
          revision.id,
          user.id,
        ],
      )
    ).rows[0];
  }
  revision = contractRevision;
  await client.query(
    `UPDATE studio_lessons SET current_revision_id = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND current_revision_id IS DISTINCT FROM $3`,
    [tenant.id, lesson.id, revision.id],
  );

  const reviewer = (
    await client.query(
      `INSERT INTO users (identity_issuer, identity_subject, email, display_name, status)
       VALUES ($1, 'dev-content-reviewer', 'reviewer@local.example', 'Local Content Reviewer', 'active')
       ON CONFLICT (identity_issuer, identity_subject)
       DO UPDATE SET status = 'active', updated_at = now()
       RETURNING id`,
      [issuer],
    )
  ).rows[0];

  let review = (
    await client.query(
      `SELECT id FROM studio_review_requests
       WHERE tenant_id = $1 AND lesson_id = $2 AND revision_id = $3 AND status = 'approved'`,
      [tenant.id, lesson.id, revision.id],
    )
  ).rows[0];
  if (!review) {
    review = (
      await client.query(
        `INSERT INTO studio_review_requests (
           id, tenant_id, institution_id, lesson_id, revision_id, status,
           requested_by, reviewed_by, reviewed_at, decision_notes
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, 'approved', $5, $6, now(),
           'Approved as connected local browser testing evidence'
         ) RETURNING id`,
        [tenant.id, institution.id, lesson.id, revision.id, user.id, reviewer.id],
      )
    ).rows[0];
  }

  const publication = (
    await client.query(
      `SELECT id FROM studio_publication_snapshots
       WHERE tenant_id = $1 AND course_space_id = $2 AND status = 'current'`,
      [tenant.id, courseSpace.id],
    )
  ).rows[0];
  if (!publication) {
    await client.query(
      `INSERT INTO studio_publication_snapshots (
         id, tenant_id, institution_id, course_space_id, publication_number,
         source_review_id, manifest, checksum_sha256, published_by
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 1, $4,
         jsonb_build_object(
           'schemaVersion', 1,
           'courseSpaceId', $3::uuid,
           'modules', jsonb_build_array(jsonb_build_object(
             'id', $5::uuid, 'title', 'Working with evidence',
             'description', 'Learn to distinguish observations, interpretations and supported claims.',
             'sequenceNumber', 1
           )),
           'lessons', jsonb_build_array(jsonb_build_object(
             'id', $6::uuid, 'moduleId', $5::uuid, 'title', 'Reading a dataset critically',
             'summary', 'Separate observation, interpretation and claim before drawing a conclusion.',
             'sequenceNumber', 1, 'estimatedMinutes', 35,
             'availabilityRule', '{}'::jsonb,
             'completionRule', '{"type":"view"}'::jsonb,
             'blocks', '[{"id":"local-heading","type":"heading","data":{"text":"Evidence before conclusions","level":2}},{"id":"local-body","type":"paragraph","data":{"text":"Record what the data shows before interpreting why it happened."}}]'::jsonb
           ))
         ),
         repeat('c', 64), $7
       )`,
      [tenant.id, institution.id, courseSpace.id, review.id, studioModule.id, lesson.id, user.id],
    );
  }

  let assignment = (
    await client.query(
      `SELECT id FROM assignments
       WHERE tenant_id = $1 AND course_run_id = $2 AND title = 'Evidence interpretation brief'`,
      [tenant.id, courseRun.id],
    )
  ).rows[0];
  if (!assignment) {
    assignment = (
      await client.query(
        `INSERT INTO assignments (
           id, tenant_id, institution_id, course_run_id, title, instructions,
           due_at, late_policy, group_mode, allowed_formats, max_attempts,
           status, created_by, updated_by
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, 'Evidence interpretation brief',
           '{"text":"Submit a concise evidence-led interpretation."}'::jsonb,
           TIMESTAMPTZ '2026-10-15 15:00:00+02',
           '{"allowed":true,"penaltyPerDay":5}'::jsonb, 'individual',
           ARRAY['text','file'], 2, 'published', $4, $4
         ) RETURNING id`,
        [tenant.id, institution.id, courseRun.id, user.id],
      )
    ).rows[0];
  }

  let gradebookCategory = (
    await client.query(
      `SELECT id FROM gradebook_categories
       WHERE tenant_id = $1 AND course_run_id = $2 AND sequence_number = 1`,
      [tenant.id, courseRun.id],
    )
  ).rows[0];
  if (!gradebookCategory) {
    gradebookCategory = (
      await client.query(
        `INSERT INTO gradebook_categories (
           id, tenant_id, institution_id, course_run_id, title, weight, sequence_number
         ) VALUES (gen_random_uuid(), $1, $2, $3, 'Assignments', 1, 1)
         RETURNING id`,
        [tenant.id, institution.id, courseRun.id],
      )
    ).rows[0];
  }

  const gradebookItem = (
    await client.query(
      `SELECT id FROM gradebook_items
       WHERE tenant_id = $1 AND course_run_id = $2 AND title = 'Evidence interpretation brief'`,
      [tenant.id, courseRun.id],
    )
  ).rows[0];
  if (!gradebookItem) {
    await client.query(
      `INSERT INTO gradebook_items (
         id, tenant_id, institution_id, course_run_id, category_id, assignment_id,
         title, maximum_score, weight, missing_policy, rounding_mode,
         decimal_places, status
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, 'Evidence interpretation brief',
         100, 1, 'incomplete', 'half_up', 2, 'active'
       )`,
      [tenant.id, institution.id, courseRun.id, gradebookCategory.id, assignment.id],
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
      `course run  ${courseRun.id}`,
      `enrolment   ${enrolment.id}`,
      `lesson      ${lesson.id}`,
    ].join("\n") + "\n",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
