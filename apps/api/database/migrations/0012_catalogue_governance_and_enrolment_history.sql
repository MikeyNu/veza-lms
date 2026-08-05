BEGIN;

CREATE TABLE enrolment_transitions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('pending','active','waitlisted','withdrawn','completed','cancelled')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES users(id),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 8 AND 160),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id)
);

CREATE INDEX enrolment_transitions_timeline_idx
  ON enrolment_transitions (tenant_id, enrolment_id, occurred_at, id);

ALTER TABLE enrolment_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrolment_transitions FORCE ROW LEVEL SECURITY;
CREATE POLICY enrolment_transitions_tenant_isolation ON enrolment_transitions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE OR REPLACE FUNCTION app.protect_approved_curriculum_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_lifecycle text;
BEGIN
  IF TG_TABLE_NAME = 'programme_version_courses' THEN
    SELECT lifecycle INTO parent_lifecycle
    FROM programme_versions
    WHERE tenant_id = COALESCE(OLD.tenant_id, NEW.tenant_id)
      AND id = COALESCE(OLD.programme_version_id, NEW.programme_version_id);
  ELSE
    SELECT lifecycle INTO parent_lifecycle
    FROM course_blueprint_versions
    WHERE tenant_id = COALESCE(OLD.tenant_id, NEW.tenant_id)
      AND id = COALESCE(OLD.course_blueprint_version_id, NEW.course_blueprint_version_id);
  END IF;

  IF parent_lifecycle = 'approved' THEN
    RAISE EXCEPTION 'approved curriculum composition is immutable; create a new version';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER programme_version_courses_immutable
BEFORE INSERT OR UPDATE OR DELETE ON programme_version_courses
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_curriculum_children();
CREATE TRIGGER blueprint_outcome_mappings_immutable
BEFORE INSERT OR UPDATE OR DELETE ON blueprint_outcome_mappings
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_curriculum_children();
CREATE TRIGGER course_requisites_immutable
BEFORE INSERT OR UPDATE OR DELETE ON course_requisites
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_curriculum_children();

COMMIT;
