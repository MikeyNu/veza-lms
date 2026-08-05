BEGIN;

CREATE TABLE learning_outcomes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 4000),
  outcome_type text NOT NULL CHECK (outcome_type IN ('knowledge','skill','competency','graduate-attribute')),
  level_code text CHECK (level_code IS NULL OR length(level_code) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id)
);

CREATE TABLE programmes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  organisational_unit_id uuid,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  programme_type text NOT NULL CHECK (programme_type IN ('qualification','learning-path','short-course','grade-band')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id, organisational_unit_id)
    REFERENCES organisational_units(tenant_id, institution_id, id)
);

CREATE TABLE programme_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  programme_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','in_review','approved','retired')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 8000),
  credit_value numeric(10,2) CHECK (credit_value IS NULL OR credit_value >= 0),
  notional_hours integer CHECK (notional_hours IS NULL OR notional_hours >= 0),
  duration_value integer CHECK (duration_value IS NULL OR duration_value > 0),
  duration_unit text CHECK (duration_unit IS NULL OR duration_unit IN ('days','weeks','months','years')),
  effective_from date,
  effective_until date,
  approval_notes text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, programme_id, version_number),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, programme_id) REFERENCES programmes(tenant_id, id),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
  CHECK ((lifecycle = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL))
);

CREATE TABLE course_definitions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  organisational_unit_id uuid,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  subject_area text CHECK (subject_area IS NULL OR length(subject_area) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id, organisational_unit_id)
    REFERENCES organisational_units(tenant_id, institution_id, id)
);

CREATE TABLE course_blueprint_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_definition_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','in_review','approved','retired')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 8000),
  credit_value numeric(10,2) CHECK (credit_value IS NULL OR credit_value >= 0),
  notional_hours integer CHECK (notional_hours IS NULL OR notional_hours >= 0),
  delivery_modes text[] NOT NULL DEFAULT ARRAY['in_person']::text[]
    CHECK (delivery_modes <@ ARRAY['in_person','online','blended','workplace']::text[] AND cardinality(delivery_modes) > 0),
  effective_from date,
  effective_until date,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_definition_id, version_number),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_definition_id) REFERENCES course_definitions(tenant_id, id),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
  CHECK ((lifecycle = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL))
);

CREATE TABLE programme_version_courses (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  programme_version_id uuid NOT NULL,
  course_blueprint_version_id uuid NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  requirement_type text NOT NULL CHECK (requirement_type IN ('required','elective','optional')),
  credit_contribution numeric(10,2) CHECK (credit_contribution IS NULL OR credit_contribution >= 0),
  PRIMARY KEY (tenant_id, programme_version_id, course_blueprint_version_id),
  UNIQUE (tenant_id, programme_version_id, sequence_number),
  FOREIGN KEY (tenant_id, programme_version_id) REFERENCES programme_versions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, course_blueprint_version_id) REFERENCES course_blueprint_versions(tenant_id, id)
);

CREATE TABLE blueprint_outcome_mappings (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_blueprint_version_id uuid NOT NULL,
  learning_outcome_id uuid NOT NULL,
  coverage_level text NOT NULL CHECK (coverage_level IN ('introduced','developed','mastered','assessed')),
  PRIMARY KEY (tenant_id, course_blueprint_version_id, learning_outcome_id),
  FOREIGN KEY (tenant_id, course_blueprint_version_id) REFERENCES course_blueprint_versions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, learning_outcome_id) REFERENCES learning_outcomes(tenant_id, id)
);

CREATE TABLE course_requisites (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_blueprint_version_id uuid NOT NULL,
  required_course_definition_id uuid NOT NULL,
  requisite_type text NOT NULL CHECK (requisite_type IN ('prerequisite','corequisite','equivalent')),
  minimum_result numeric(6,2),
  PRIMARY KEY (tenant_id, course_blueprint_version_id, required_course_definition_id, requisite_type),
  FOREIGN KEY (tenant_id, course_blueprint_version_id) REFERENCES course_blueprint_versions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, required_course_definition_id) REFERENCES course_definitions(tenant_id, id)
);

CREATE TABLE course_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  academic_period_id uuid NOT NULL,
  course_blueprint_version_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 2 AND 40),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('in_person','online','blended','workplace')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','scheduled','open','in_progress','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id, academic_period_id)
    REFERENCES academic_periods(tenant_id, institution_id, id),
  FOREIGN KEY (tenant_id, course_blueprint_version_id) REFERENCES course_blueprint_versions(tenant_id, id),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE cohorts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 2 AND 40),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','completed','archived')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE class_sections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  cohort_id uuid,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 40),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_run_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES cohorts(tenant_id, id)
);

CREATE TABLE class_staff_allocations (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_section_id uuid NOT NULL,
  person_id uuid NOT NULL,
  allocation_role text NOT NULL CHECK (allocation_role IN ('lead-instructor','instructor','assistant','assessor')),
  valid_from date NOT NULL,
  valid_until date,
  assigned_by uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (tenant_id, class_section_id, person_id, allocation_role, valid_from),
  FOREIGN KEY (tenant_id, class_section_id) REFERENCES class_sections(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, person_id) REFERENCES people(tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE TABLE enrolments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  class_section_id uuid,
  cohort_id uuid,
  status text NOT NULL CHECK (status IN ('pending','active','waitlisted','withdrawn','completed','cancelled')),
  enrolled_on date NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  withdrawal_reason text,
  completion_result numeric(6,2),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','integration','transfer')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id),
  FOREIGN KEY (tenant_id, class_section_id) REFERENCES class_sections(tenant_id, id),
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES cohorts(tenant_id, id),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (status <> 'withdrawn' OR withdrawal_reason IS NOT NULL)
);

CREATE UNIQUE INDEX enrolments_one_current_run_idx
  ON enrolments (tenant_id, learner_person_id, course_run_id)
  WHERE effective_until IS NULL AND status NOT IN ('cancelled','withdrawn');
CREATE INDEX course_runs_period_idx ON course_runs (tenant_id, institution_id, academic_period_id, lifecycle);
CREATE INDEX enrolments_run_status_idx ON enrolments (tenant_id, course_run_id, status, learner_person_id);
CREATE INDEX programme_versions_lifecycle_idx ON programme_versions (tenant_id, programme_id, lifecycle, version_number DESC);
CREATE INDEX blueprint_versions_lifecycle_idx ON course_blueprint_versions (tenant_id, course_definition_id, lifecycle, version_number DESC);

CREATE OR REPLACE FUNCTION app.protect_approved_curriculum()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle = 'approved' AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.credit_value IS DISTINCT FROM OLD.credit_value OR
    NEW.notional_hours IS DISTINCT FROM OLD.notional_hours OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.effective_until IS DISTINCT FROM OLD.effective_until
  ) THEN
    RAISE EXCEPTION 'approved curriculum versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER programme_versions_immutable
BEFORE UPDATE ON programme_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_curriculum();
CREATE TRIGGER blueprint_versions_immutable
BEFORE UPDATE ON course_blueprint_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_curriculum();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'learning_outcomes','programmes','programme_versions','course_definitions',
    'course_blueprint_versions','programme_version_courses','blueprint_outcome_mappings',
    'course_requisites','course_runs','cohorts','class_sections','class_staff_allocations','enrolments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      table_name, table_name
    );
  END LOOP;
END $$;

COMMIT;
