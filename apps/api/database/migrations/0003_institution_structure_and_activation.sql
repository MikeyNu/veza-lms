CREATE TABLE tenant_setup_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  identity_mode text NOT NULL CHECK (identity_mode IN ('managed', 'sso', 'hybrid')),
  support_email citext NOT NULL,
  privacy_contact_email citext NOT NULL,
  data_retention_days integer NOT NULL CHECK (data_retention_days BETWEEN 30 AND 3650),
  learner_support_sla_hours integer NOT NULL CHECK (learner_support_sla_hours BETWEEN 1 AND 720),
  configured_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code citext NOT NULL,
  display_name text NOT NULL,
  legal_name text,
  institution_type text NOT NULL CHECK (institution_type IN (
    'school', 'college', 'university', 'training-provider', 'corporate-academy', 'other'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  locale text NOT NULL,
  timezone text NOT NULL,
  contact_email citext,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  code citext NOT NULL,
  display_name text NOT NULL,
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('physical', 'virtual', 'hybrid')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  is_primary boolean NOT NULL DEFAULT false,
  timezone text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, institution_id, code),
  UNIQUE (tenant_id, institution_id, id)
);

CREATE UNIQUE INDEX campuses_one_primary_active_idx
  ON campuses (tenant_id, institution_id)
  WHERE is_primary = true AND status <> 'archived';

CREATE TABLE organisational_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  parent_unit_id uuid,
  code citext NOT NULL,
  display_name text NOT NULL,
  unit_type text NOT NULL CHECK (unit_type IN (
    'faculty', 'school', 'department', 'division', 'centre', 'programme-office', 'other'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, institution_id, parent_unit_id)
    REFERENCES organisational_units(tenant_id, institution_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, institution_id, code),
  UNIQUE (tenant_id, institution_id, id),
  CHECK (parent_unit_id IS NULL OR parent_unit_id <> id)
);

CREATE INDEX organisational_units_parent_idx
  ON organisational_units (tenant_id, institution_id, parent_unit_id);

CREATE TABLE academic_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  parent_period_id uuid,
  code citext NOT NULL,
  display_name text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN (
    'academic-year', 'semester', 'trimester', 'term', 'quarter', 'block', 'custom'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  teaching_starts_on date,
  teaching_ends_on date,
  enrolment_opens_at timestamptz,
  enrolment_closes_at timestamptz,
  results_release_at timestamptz,
  timezone text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  published_by uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, institution_id, parent_period_id)
    REFERENCES academic_periods(tenant_id, institution_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, institution_id, code),
  UNIQUE (tenant_id, institution_id, id),
  CHECK (ends_on >= starts_on),
  CHECK (teaching_starts_on IS NULL OR teaching_starts_on >= starts_on),
  CHECK (teaching_ends_on IS NULL OR teaching_ends_on <= ends_on),
  CHECK (teaching_starts_on IS NULL OR teaching_ends_on IS NULL OR teaching_ends_on >= teaching_starts_on),
  CHECK (enrolment_opens_at IS NULL OR enrolment_closes_at IS NULL OR enrolment_closes_at > enrolment_opens_at),
  CHECK ((status <> 'published') OR (published_by IS NOT NULL AND published_at IS NOT NULL)),
  CHECK (parent_period_id IS NULL OR parent_period_id <> id)
);

CREATE INDEX academic_periods_calendar_idx
  ON academic_periods (tenant_id, institution_id, starts_on, ends_on);

CREATE TABLE institutional_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  policy_key text NOT NULL CHECK (policy_key IN (
    'privacy', 'data-retention', 'acceptable-use', 'academic-integrity',
    'assessment', 'attendance', 'safeguarding', 'support-escalation', 'communications'
  )),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  title text NOT NULL,
  content jsonb NOT NULL,
  content_checksum text NOT NULL,
  effective_from date,
  effective_until date,
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, institution_id, policy_key, version),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
  CHECK ((status <> 'approved') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL))
);

CREATE UNIQUE INDEX institutional_policies_current_approved_idx
  ON institutional_policies (tenant_id, institution_id, policy_key)
  WHERE status = 'approved' AND effective_until IS NULL;

CREATE INDEX institutional_policies_lookup_idx
  ON institutional_policies (tenant_id, institution_id, policy_key, status, version DESC);

CREATE OR REPLACE FUNCTION app.protect_published_academic_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'published' AND (
    NEW.institution_id IS DISTINCT FROM OLD.institution_id OR
    NEW.parent_period_id IS DISTINCT FROM OLD.parent_period_id OR
    NEW.code IS DISTINCT FROM OLD.code OR
    NEW.display_name IS DISTINCT FROM OLD.display_name OR
    NEW.period_type IS DISTINCT FROM OLD.period_type OR
    NEW.starts_on IS DISTINCT FROM OLD.starts_on OR
    NEW.ends_on IS DISTINCT FROM OLD.ends_on OR
    NEW.teaching_starts_on IS DISTINCT FROM OLD.teaching_starts_on OR
    NEW.teaching_ends_on IS DISTINCT FROM OLD.teaching_ends_on OR
    NEW.enrolment_opens_at IS DISTINCT FROM OLD.enrolment_opens_at OR
    NEW.enrolment_closes_at IS DISTINCT FROM OLD.enrolment_closes_at OR
    NEW.results_release_at IS DISTINCT FROM OLD.results_release_at OR
    NEW.timezone IS DISTINCT FROM OLD.timezone
  ) THEN
    RAISE EXCEPTION 'Published academic periods are structurally immutable; create a replacement period';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_published_academic_period_trigger
BEFORE UPDATE ON academic_periods
FOR EACH ROW EXECUTE FUNCTION app.protect_published_academic_period();

CREATE OR REPLACE FUNCTION app.protect_approved_institutional_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'approved' AND (
    NEW.institution_id IS DISTINCT FROM OLD.institution_id OR
    NEW.policy_key IS DISTINCT FROM OLD.policy_key OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.content_checksum IS DISTINCT FROM OLD.content_checksum OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'Approved policy content is immutable; approve a new version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_approved_institutional_policy_trigger
BEFORE UPDATE ON institutional_policies
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_institutional_policy();

ALTER TABLE tenant_setup_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_setup_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_setup_profiles_isolation ON tenant_setup_profiles
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions FORCE ROW LEVEL SECURITY;
CREATE POLICY institutions_isolation ON institutions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses FORCE ROW LEVEL SECURITY;
CREATE POLICY campuses_isolation ON campuses
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE organisational_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisational_units FORCE ROW LEVEL SECURITY;
CREATE POLICY organisational_units_isolation ON organisational_units
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY academic_periods_isolation ON academic_periods
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE institutional_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutional_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY institutional_policies_isolation ON institutional_policies
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON tenant_setup_profiles, institutions, campuses,
  organisational_units, academic_periods, institutional_policies TO veza_app;

COMMENT ON TABLE tenant_setup_profiles IS
  'Tenant activation inputs that must be configured by an accountable tenant administrator.';
COMMENT ON TABLE institutional_policies IS
  'Versioned institution policies. Approved versions are immutable through application services; changes create a new version.';
