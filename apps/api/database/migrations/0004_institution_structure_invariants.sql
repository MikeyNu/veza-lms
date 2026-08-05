CREATE OR REPLACE FUNCTION app.validate_organisational_unit_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  creates_cycle boolean;
BEGIN
  IF NEW.parent_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_unit_id = NEW.id THEN
    RAISE EXCEPTION 'Organisational unit cannot be its own parent';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_unit_id
    FROM organisational_units
    WHERE tenant_id = NEW.tenant_id
      AND institution_id = NEW.institution_id
      AND id = NEW.parent_unit_id
    UNION ALL
    SELECT unit.id, unit.parent_unit_id
    FROM organisational_units unit
    JOIN ancestors ancestor ON unit.id = ancestor.parent_unit_id
    WHERE unit.tenant_id = NEW.tenant_id
      AND unit.institution_id = NEW.institution_id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
  INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'Organisational unit hierarchy cannot contain a cycle';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_organisational_unit_hierarchy_trigger
BEFORE INSERT OR UPDATE OF tenant_id, institution_id, parent_unit_id
ON organisational_units
FOR EACH ROW EXECUTE FUNCTION app.validate_organisational_unit_hierarchy();

CREATE OR REPLACE FUNCTION app.validate_academic_period_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_record academic_periods%ROWTYPE;
  creates_cycle boolean;
BEGIN
  IF NEW.parent_period_id IS NOT NULL THEN
    IF NEW.parent_period_id = NEW.id THEN
      RAISE EXCEPTION 'Academic period cannot be its own parent';
    END IF;

    SELECT * INTO parent_record
    FROM academic_periods
    WHERE tenant_id = NEW.tenant_id
      AND institution_id = NEW.institution_id
      AND id = NEW.parent_period_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent academic period is not available in this institution';
    END IF;

    IF NEW.starts_on < parent_record.starts_on OR NEW.ends_on > parent_record.ends_on THEN
      RAISE EXCEPTION 'Child academic period must remain inside the parent period';
    END IF;

    IF NEW.status = 'published' AND parent_record.status <> 'published' THEN
      RAISE EXCEPTION 'Parent academic period must be published before its child';
    END IF;

    WITH RECURSIVE ancestors AS (
      SELECT id, parent_period_id
      FROM academic_periods
      WHERE tenant_id = NEW.tenant_id
        AND institution_id = NEW.institution_id
        AND id = NEW.parent_period_id
      UNION ALL
      SELECT period.id, period.parent_period_id
      FROM academic_periods period
      JOIN ancestors ancestor ON period.id = ancestor.parent_period_id
      WHERE period.tenant_id = NEW.tenant_id
        AND period.institution_id = NEW.institution_id
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
    INTO creates_cycle;

    IF creates_cycle THEN
      RAISE EXCEPTION 'Academic period hierarchy cannot contain a cycle';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM academic_periods child
    WHERE child.tenant_id = NEW.tenant_id
      AND child.institution_id = NEW.institution_id
      AND child.parent_period_id = NEW.id
      AND (child.starts_on < NEW.starts_on OR child.ends_on > NEW.ends_on)
  ) THEN
    RAISE EXCEPTION 'Academic period cannot exclude an existing child period';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_academic_period_hierarchy_trigger
BEFORE INSERT OR UPDATE OF tenant_id, institution_id, parent_period_id, status, starts_on, ends_on
ON academic_periods
FOR EACH ROW EXECUTE FUNCTION app.validate_academic_period_hierarchy();

COMMENT ON FUNCTION app.validate_organisational_unit_hierarchy() IS
  'Defensively rejects organisational-unit cycles even when writes bypass application services.';
COMMENT ON FUNCTION app.validate_academic_period_hierarchy() IS
  'Defensively enforces academic-period containment, acyclic hierarchy and parent publication order.';
