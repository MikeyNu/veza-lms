BEGIN;

CREATE TABLE assignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  instructions jsonb NOT NULL CHECK (jsonb_typeof(instructions)='object'),
  due_at timestamptz,
  late_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(late_policy)='object'),
  group_mode text NOT NULL DEFAULT 'individual' CHECK (group_mode IN ('individual','group')),
  allowed_formats text[] NOT NULL DEFAULT ARRAY['text']::text[] CHECK (cardinality(allowed_formats)>0),
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,course_run_id) REFERENCES course_runs(tenant_id,id)
);

CREATE TABLE rubrics (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>created_by))
);

CREATE TABLE rubric_criteria (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rubric_id uuid NOT NULL,
  criterion_id uuid NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number>0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  description text,
  maximum_score numeric(8,2) NOT NULL CHECK (maximum_score>0),
  levels jsonb NOT NULL CHECK (jsonb_typeof(levels)='array' AND jsonb_array_length(levels)>0),
  PRIMARY KEY (tenant_id,rubric_id,criterion_id),
  UNIQUE (tenant_id,rubric_id,sequence_number),
  FOREIGN KEY (tenant_id,rubric_id) REFERENCES rubrics(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE assignment_rubrics (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  rubric_id uuid NOT NULL,
  PRIMARY KEY (tenant_id,assignment_id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES assignments(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,rubric_id) REFERENCES rubrics(tenant_id,id)
);

CREATE TABLE assignment_accommodations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  due_at_override timestamptz,
  extra_attempts integer NOT NULL DEFAULT 0 CHECK (extra_attempts BETWEEN 0 AND 100),
  format_overrides text[],
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  approved_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,assignment_id,learner_person_id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES assignments(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,learner_person_id) REFERENCES people(tenant_id,id)
);

CREATE TABLE submission_attempts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number>0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','uploading','submitted','quarantined','accepted','withdrawn')),
  submitted_at timestamptz,
  receipt_number text,
  receipt_checksum text CHECK (receipt_checksum IS NULL OR receipt_checksum ~ '^[a-f0-9]{64}$'),
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_snapshot)='object'),
  is_late boolean NOT NULL DEFAULT false,
  supersedes_attempt_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,assignment_id,enrolment_id,attempt_number),
  UNIQUE (tenant_id,receipt_number),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES assignments(tenant_id,id),
  FOREIGN KEY (tenant_id,enrolment_id) REFERENCES enrolments(tenant_id,id),
  FOREIGN KEY (tenant_id,learner_person_id) REFERENCES people(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_attempt_id) REFERENCES submission_attempts(tenant_id,id)
);

CREATE TABLE submission_files (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  submission_attempt_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  object_key text NOT NULL CHECK (length(object_key) BETWEEN 3 AND 1024),
  media_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10737418240),
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  upload_session_id text,
  upload_offset bigint NOT NULL DEFAULT 0 CHECK (upload_offset>=0),
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','infected','failed')),
  scan_evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,submission_attempt_id,checksum),
  FOREIGN KEY (tenant_id,submission_attempt_id) REFERENCES submission_attempts(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE marker_allocations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  submission_attempt_id uuid NOT NULL,
  marker_person_id uuid NOT NULL,
  allocation_role text NOT NULL CHECK (allocation_role IN ('primary','second','moderator')),
  status text NOT NULL DEFAULT 'allocated' CHECK (status IN ('allocated','accepted','completed','reassigned')),
  allocated_by uuid NOT NULL REFERENCES users(id),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,submission_attempt_id,allocation_role),
  FOREIGN KEY (tenant_id,submission_attempt_id) REFERENCES submission_attempts(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,marker_person_id) REFERENCES people(tenant_id,id)
);

CREATE TABLE submission_marks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  submission_attempt_id uuid NOT NULL,
  marker_allocation_id uuid NOT NULL,
  score numeric(8,2) NOT NULL,
  rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rubric_scores)='object'),
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(feedback)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','moderated','released','superseded')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  supersedes_mark_id uuid,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,submission_attempt_id) REFERENCES submission_attempts(tenant_id,id),
  FOREIGN KEY (tenant_id,marker_allocation_id) REFERENCES marker_allocations(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_mark_id) REFERENCES submission_marks(tenant_id,id)
);

CREATE TABLE gradebook_categories (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  weight numeric(7,4) NOT NULL CHECK (weight>=0 AND weight<=1),
  sequence_number integer NOT NULL CHECK (sequence_number>0),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,course_run_id,sequence_number),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,course_run_id) REFERENCES course_runs(tenant_id,id)
);

CREATE TABLE gradebook_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  category_id uuid,
  assignment_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  maximum_score numeric(8,2) NOT NULL CHECK (maximum_score>0),
  weight numeric(7,4) CHECK (weight IS NULL OR (weight>=0 AND weight<=1)),
  missing_policy text NOT NULL DEFAULT 'zero' CHECK (missing_policy IN ('zero','ignore','incomplete')),
  rounding_mode text NOT NULL DEFAULT 'half_up' CHECK (rounding_mode IN ('half_up','half_even','floor','ceiling','truncate')),
  decimal_places integer NOT NULL DEFAULT 2 CHECK (decimal_places BETWEEN 0 AND 6),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,course_run_id) REFERENCES course_runs(tenant_id,id),
  FOREIGN KEY (tenant_id,category_id) REFERENCES gradebook_categories(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES assignments(tenant_id,id)
);

CREATE TABLE gradebook_formula_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_run_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number>0),
  formula jsonb NOT NULL CHECK (jsonb_typeof(formula)='object'),
  impact_preview jsonb NOT NULL CHECK (jsonb_typeof(impact_preview)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,course_run_id,version_number),
  FOREIGN KEY (tenant_id,course_run_id) REFERENCES course_runs(tenant_id,id),
  CHECK (status <> 'active' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>created_by))
);
CREATE UNIQUE INDEX gradebook_formula_one_active_idx ON gradebook_formula_versions(tenant_id,course_run_id) WHERE status='active';

CREATE TABLE learner_grade_results (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enrolment_id uuid NOT NULL,
  gradebook_item_id uuid NOT NULL,
  source_mark_id uuid,
  raw_score numeric(8,2),
  calculated_score numeric(8,2),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','corrected')),
  is_missing boolean NOT NULL DEFAULT false,
  is_excluded boolean NOT NULL DEFAULT false,
  is_exempt boolean NOT NULL DEFAULT false,
  override_score numeric(8,2),
  override_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  supersedes_result_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,enrolment_id) REFERENCES enrolments(tenant_id,id),
  FOREIGN KEY (tenant_id,gradebook_item_id) REFERENCES gradebook_items(tenant_id,id),
  FOREIGN KEY (tenant_id,source_mark_id) REFERENCES submission_marks(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_result_id) REFERENCES learner_grade_results(tenant_id,id),
  CHECK (override_score IS NULL OR (override_reason IS NOT NULL AND length(btrim(override_reason)) BETWEEN 10 AND 1000))
);
CREATE UNIQUE INDEX learner_grade_current_idx ON learner_grade_results(tenant_id,enrolment_id,gradebook_item_id) WHERE state <> 'corrected';

CREATE TABLE certificate_templates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  document_schema jsonb NOT NULL CHECK (jsonb_typeof(document_schema)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>created_by))
);

CREATE TABLE certificate_award_rules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  template_id uuid NOT NULL,
  programme_id uuid,
  course_definition_id uuid,
  rule_schema jsonb NOT NULL CHECK (jsonb_typeof(rule_schema)='object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,template_id) REFERENCES certificate_templates(tenant_id,id),
  FOREIGN KEY (tenant_id,programme_id) REFERENCES programmes(tenant_id,id),
  FOREIGN KEY (tenant_id,course_definition_id) REFERENCES course_definitions(tenant_id,id),
  CHECK ((programme_id IS NOT NULL)::int + (course_definition_id IS NOT NULL)::int = 1)
);

CREATE TABLE issued_certificates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid,
  award_rule_id uuid NOT NULL,
  verification_code text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','revoked','superseded')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid NOT NULL REFERENCES users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revocation_reason text,
  UNIQUE (tenant_id,id),
  UNIQUE (verification_code),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,learner_person_id) REFERENCES people(tenant_id,id),
  FOREIGN KEY (tenant_id,enrolment_id) REFERENCES enrolments(tenant_id,id),
  FOREIGN KEY (tenant_id,award_rule_id) REFERENCES certificate_award_rules(tenant_id,id),
  CHECK (status <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL))
);

CREATE TABLE export_jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid,
  export_type text NOT NULL CHECK (export_type IN ('transcript','gradebook','enrolments','people','analytics')),
  format text NOT NULL CHECK (format IN ('csv','json')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters)='object'),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','ready','failed','expired')),
  object_key text,
  checksum text CHECK (checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$'),
  row_count bigint,
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  expires_at timestamptz,
  failure_reason text,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id)
);

CREATE TABLE metric_definitions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9._-]{2,79}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 2000),
  unit text NOT NULL,
  calculation_schema jsonb NOT NULL CHECK (jsonb_typeof(calculation_schema)='object'),
  freshness_target_seconds integer NOT NULL CHECK (freshness_target_seconds>0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,metric_key)
);

CREATE TABLE metric_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid,
  metric_definition_id uuid NOT NULL,
  dimension_key text NOT NULL,
  dimension_value text NOT NULL,
  metric_value numeric(20,6) NOT NULL,
  measured_at timestamptz NOT NULL,
  source_max_occurred_at timestamptz NOT NULL,
  drillthrough_filter jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(drillthrough_filter)='object'),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,metric_definition_id,institution_id,dimension_key,dimension_value,measured_at),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,metric_definition_id) REFERENCES metric_definitions(tenant_id,id)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['assignments','rubrics','rubric_criteria','assignment_rubrics','assignment_accommodations','submission_attempts','submission_files','marker_allocations','submission_marks','gradebook_categories','gradebook_items','gradebook_formula_versions','learner_grade_results','certificate_templates','certificate_award_rules','issued_certificates','export_jobs','metric_definitions','metric_snapshots'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',t,t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO veza_app',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app.protect_submission_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('submitted','accepted') AND (
    NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR
    NEW.enrolment_id IS DISTINCT FROM OLD.enrolment_id OR
    NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR
    NEW.receipt_number IS DISTINCT FROM OLD.receipt_number OR
    NEW.receipt_checksum IS DISTINCT FROM OLD.receipt_checksum OR
    NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot OR
    NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
  ) THEN RAISE EXCEPTION 'submitted attempt receipt is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER submission_attempt_receipt_immutable BEFORE UPDATE ON submission_attempts FOR EACH ROW EXECUTE FUNCTION app.protect_submission_receipt();

CREATE OR REPLACE FUNCTION app.protect_issued_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='issued' AND (
    NEW.payload IS DISTINCT FROM OLD.payload OR
    NEW.payload_checksum IS DISTINCT FROM OLD.payload_checksum OR
    NEW.verification_code IS DISTINCT FROM OLD.verification_code OR
    NEW.learner_person_id IS DISTINCT FROM OLD.learner_person_id OR
    NEW.award_rule_id IS DISTINCT FROM OLD.award_rule_id
  ) THEN RAISE EXCEPTION 'issued certificate evidence is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issued_certificate_immutable BEFORE UPDATE ON issued_certificates FOR EACH ROW EXECUTE FUNCTION app.protect_issued_certificate();

COMMIT;
