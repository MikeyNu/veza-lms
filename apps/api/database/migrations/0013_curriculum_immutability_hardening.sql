BEGIN;

DROP TRIGGER IF EXISTS programme_versions_immutable ON programme_versions;
DROP TRIGGER IF EXISTS blueprint_versions_immutable ON course_blueprint_versions;
DROP FUNCTION IF EXISTS app.protect_approved_curriculum();

CREATE OR REPLACE FUNCTION app.protect_approved_programme_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle = 'approved' AND (
    NEW.programme_id IS DISTINCT FROM OLD.programme_id OR
    NEW.version_number IS DISTINCT FROM OLD.version_number OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.credit_value IS DISTINCT FROM OLD.credit_value OR
    NEW.notional_hours IS DISTINCT FROM OLD.notional_hours OR
    NEW.duration_value IS DISTINCT FROM OLD.duration_value OR
    NEW.duration_unit IS DISTINCT FROM OLD.duration_unit OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.effective_until IS DISTINCT FROM OLD.effective_until OR
    NEW.approval_notes IS DISTINCT FROM OLD.approval_notes OR
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'approved programme versions are immutable; create a replacement version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_approved_blueprint_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle = 'approved' AND (
    NEW.course_definition_id IS DISTINCT FROM OLD.course_definition_id OR
    NEW.version_number IS DISTINCT FROM OLD.version_number OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.credit_value IS DISTINCT FROM OLD.credit_value OR
    NEW.notional_hours IS DISTINCT FROM OLD.notional_hours OR
    NEW.delivery_modes IS DISTINCT FROM OLD.delivery_modes OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.effective_until IS DISTINCT FROM OLD.effective_until OR
    NEW.approval_notes IS DISTINCT FROM OLD.approval_notes OR
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'approved blueprint versions are immutable; create a replacement version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER programme_versions_immutable
BEFORE UPDATE ON programme_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_programme_version();
CREATE TRIGGER blueprint_versions_immutable
BEFORE UPDATE ON course_blueprint_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_blueprint_version();

CREATE OR REPLACE FUNCTION app.protect_approved_curriculum_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_tenant_id uuid;
  selected_parent_id uuid;
  parent_lifecycle text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    selected_tenant_id := OLD.tenant_id;
  ELSE
    selected_tenant_id := NEW.tenant_id;
  END IF;

  IF TG_TABLE_NAME = 'programme_version_courses' THEN
    selected_parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.programme_version_id ELSE NEW.programme_version_id END;
    SELECT lifecycle INTO parent_lifecycle
    FROM programme_versions
    WHERE tenant_id = selected_tenant_id AND id = selected_parent_id;
  ELSE
    selected_parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_blueprint_version_id ELSE NEW.course_blueprint_version_id END;
    SELECT lifecycle INTO parent_lifecycle
    FROM course_blueprint_versions
    WHERE tenant_id = selected_tenant_id AND id = selected_parent_id;
  END IF;

  IF parent_lifecycle = 'approved' THEN
    RAISE EXCEPTION 'approved curriculum composition is immutable; create a new version';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMIT;
