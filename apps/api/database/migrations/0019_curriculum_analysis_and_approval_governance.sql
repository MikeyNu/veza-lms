BEGIN;

ALTER TABLE course_definitions
  ADD COLUMN IF NOT EXISTS definition_type text NOT NULL DEFAULT 'course'
    CHECK (definition_type IN ('subject','module','course','unit')),
  ADD COLUMN IF NOT EXISTS parent_definition_id uuid;
ALTER TABLE course_definitions
  ADD CONSTRAINT course_definitions_parent_fk
  FOREIGN KEY (tenant_id, parent_definition_id)
  REFERENCES course_definitions(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE course_definitions
  ADD CONSTRAINT course_definitions_parent_not_self
  CHECK (parent_definition_id IS NULL OR parent_definition_id <> id);
CREATE INDEX course_definitions_hierarchy_idx
  ON course_definitions (tenant_id, institution_id, parent_definition_id, definition_type, code);

ALTER TABLE programme_versions
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_review_id uuid;
ALTER TABLE course_blueprint_versions
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_review_id uuid;

CREATE TABLE curriculum_validation_policies (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','approved','retired')),
  credit_required boolean NOT NULL DEFAULT false,
  notional_hours_required boolean NOT NULL DEFAULT true,
  duration_required boolean NOT NULL DEFAULT false,
  hours_per_credit numeric(10,2) CHECK (hours_per_credit IS NULL OR hours_per_credit > 0),
  ratio_tolerance_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (ratio_tolerance_percent BETWEEN 0 AND 100),
  minimum_credit numeric(10,2) CHECK (minimum_credit IS NULL OR minimum_credit >= 0),
  maximum_credit numeric(10,2) CHECK (maximum_credit IS NULL OR maximum_credit > 0),
  minimum_notional_hours integer CHECK (minimum_notional_hours IS NULL OR minimum_notional_hours >= 0),
  maximum_notional_hours integer CHECK (maximum_notional_hours IS NULL OR maximum_notional_hours > 0),
  effective_from date,
  effective_until date,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, version_number),
  CHECK (maximum_credit IS NULL OR minimum_credit IS NULL OR maximum_credit >= minimum_credit),
  CHECK (maximum_notional_hours IS NULL OR minimum_notional_hours IS NULL OR maximum_notional_hours >= minimum_notional_hours),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
  CHECK (lifecycle <> 'approved' OR (effective_from IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by <> created_by))
);
CREATE UNIQUE INDEX curriculum_validation_policies_current_uq
  ON curriculum_validation_policies (tenant_id, institution_id)
  WHERE lifecycle = 'approved' AND effective_until IS NULL;

CREATE TABLE programme_outcome_requirements (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  programme_version_id uuid NOT NULL,
  learning_outcome_id uuid NOT NULL,
  minimum_coverage_level text NOT NULL DEFAULT 'developed'
    CHECK (minimum_coverage_level IN ('introduced','developed','mastered','assessed')),
  PRIMARY KEY (tenant_id, programme_version_id, learning_outcome_id),
  FOREIGN KEY (tenant_id, programme_version_id)
    REFERENCES programme_versions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, learning_outcome_id)
    REFERENCES learning_outcomes(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE curriculum_change_reviews (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('programme-version','course-blueprint-version')),
  resource_id uuid NOT NULL,
  resource_version integer NOT NULL CHECK (resource_version > 0),
  compared_to_resource_id uuid,
  impact_snapshot jsonb NOT NULL,
  validation_snapshot jsonb NOT NULL,
  outcome_coverage_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'current' CHECK (status IN ('current','stale','consumed')),
  generated_by uuid NOT NULL REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  consumed_by uuid REFERENCES users(id),
  consumed_at timestamptz,
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  CHECK (jsonb_typeof(impact_snapshot) = 'object' AND octet_length(impact_snapshot::text) <= 131072),
  CHECK (jsonb_typeof(validation_snapshot) = 'object' AND octet_length(validation_snapshot::text) <= 65536),
  CHECK (jsonb_typeof(outcome_coverage_snapshot) = 'object' AND octet_length(outcome_coverage_snapshot::text) <= 131072),
  CHECK ((status = 'consumed') = (consumed_by IS NOT NULL AND consumed_at IS NOT NULL))
);
CREATE INDEX curriculum_change_reviews_resource_idx
  ON curriculum_change_reviews (tenant_id, resource_type, resource_id, generated_at DESC);

ALTER TABLE programme_versions
  ADD CONSTRAINT programme_versions_approval_review_fk
  FOREIGN KEY (tenant_id, approval_review_id)
  REFERENCES curriculum_change_reviews(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE course_blueprint_versions
  ADD CONSTRAINT blueprint_versions_approval_review_fk
  FOREIGN KEY (tenant_id, approval_review_id)
  REFERENCES curriculum_change_reviews(tenant_id, id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app.enforce_curriculum_approval_segregation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lifecycle = 'in_review' AND OLD.lifecycle = 'draft' THEN
    IF NEW.submitted_by IS NULL OR NEW.submitted_at IS NULL THEN
      RAISE EXCEPTION 'curriculum review submission requires actor and timestamp';
    END IF;
  END IF;
  IF NEW.lifecycle = 'approved' AND OLD.lifecycle <> 'approved' THEN
    IF OLD.lifecycle <> 'in_review' THEN
      RAISE EXCEPTION 'curriculum must be in review before approval';
    END IF;
    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.approval_review_id IS NULL THEN
      RAISE EXCEPTION 'curriculum approval requires approver, timestamp and impact review';
    END IF;
    IF NEW.approved_by = NEW.created_by OR NEW.approved_by = NEW.submitted_by THEN
      RAISE EXCEPTION 'curriculum approval requires an independent approver';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER programme_versions_approval_segregation
BEFORE UPDATE OF lifecycle ON programme_versions
FOR EACH ROW EXECUTE FUNCTION app.enforce_curriculum_approval_segregation();
CREATE TRIGGER blueprint_versions_approval_segregation
BEFORE UPDATE OF lifecycle ON course_blueprint_versions
FOR EACH ROW EXECUTE FUNCTION app.enforce_curriculum_approval_segregation();

CREATE OR REPLACE FUNCTION app.protect_curriculum_analysis_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_lifecycle text;
DECLARE parent_id uuid;
BEGIN
  parent_id := COALESCE(NEW.programme_version_id, OLD.programme_version_id);
  SELECT lifecycle INTO parent_lifecycle
  FROM programme_versions
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND id = parent_id;
  IF parent_lifecycle = 'approved' THEN
    RAISE EXCEPTION 'approved programme outcome requirements are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER programme_outcome_requirements_immutable
BEFORE INSERT OR UPDATE OR DELETE ON programme_outcome_requirements
FOR EACH ROW EXECUTE FUNCTION app.protect_curriculum_analysis_children();

ALTER TABLE curriculum_validation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_validation_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE programme_outcome_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_outcome_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE curriculum_change_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_change_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY curriculum_validation_policies_tenant_isolation ON curriculum_validation_policies
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY programme_outcome_requirements_tenant_isolation ON programme_outcome_requirements
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY curriculum_change_reviews_tenant_isolation ON curriculum_change_reviews
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  curriculum_validation_policies,
  programme_outcome_requirements,
  curriculum_change_reviews
TO veza_app;

COMMIT;
