BEGIN;

CREATE OR REPLACE FUNCTION app.guard_credential_definition_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE target_institution uuid;
BEGIN
  IF TG_TABLE_NAME='certificate_templates' THEN
    IF NEW.updated_by IS NULL THEN
      NEW.updated_by:=NEW.created_by;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME='certificate_award_rules' THEN
    SELECT institution_id INTO target_institution
    FROM certificate_templates
    WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id AND status='approved';
    IF target_institution IS NULL OR target_institution<>NEW.institution_id THEN
      RAISE EXCEPTION 'award rules require an approved template in the same institution';
    END IF;
    IF NEW.programme_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM programmes
      WHERE tenant_id=NEW.tenant_id AND id=NEW.programme_id
        AND institution_id=NEW.institution_id AND status='active'
    ) THEN
      RAISE EXCEPTION 'award-rule programme is unavailable in the selected institution';
    END IF;
    IF NEW.course_definition_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM course_definitions
      WHERE tenant_id=NEW.tenant_id AND id=NEW.course_definition_id
        AND institution_id=NEW.institution_id AND status='active'
    ) THEN
      RAISE EXCEPTION 'award-rule course definition is unavailable in the selected institution';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificate_templates_insert_guard ON certificate_templates;
CREATE TRIGGER certificate_templates_insert_guard
BEFORE INSERT ON certificate_templates
FOR EACH ROW EXECUTE FUNCTION app.guard_credential_definition_insert();

DROP TRIGGER IF EXISTS certificate_award_rules_insert_guard ON certificate_award_rules;
CREATE TRIGGER certificate_award_rules_insert_guard
BEFORE INSERT ON certificate_award_rules
FOR EACH ROW EXECUTE FUNCTION app.guard_credential_definition_insert();

COMMIT;
