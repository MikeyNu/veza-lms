BEGIN;

CREATE OR REPLACE FUNCTION app.protect_person_identity_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.linked_user_id IS NOT NULL
     AND current_setting('app.allow_person_identity_link', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'person identity links require the dedicated identity workflow';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.linked_user_id IS DISTINCT FROM OLD.linked_user_id
     AND current_setting('app.allow_person_identity_link', true) IS DISTINCT FROM 'true' THEN
    NEW.linked_user_id := OLD.linked_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_identity_link_guard ON people;
CREATE TRIGGER people_identity_link_guard
BEFORE INSERT OR UPDATE OF linked_user_id ON people
FOR EACH ROW EXECUTE FUNCTION app.protect_person_identity_link();

CREATE OR REPLACE FUNCTION app.require_reconciled_people_import()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'committing' AND OLD.status IS DISTINCT FROM 'committing' THEN
    IF NEW.invalid_rows <> 0 OR NEW.duplicate_rows <> 0 THEN
      RAISE EXCEPTION 'people import contains unresolved invalid or duplicate rows';
    END IF;
    IF EXISTS (
      SELECT 1 FROM people_import_rows row
      WHERE row.tenant_id=NEW.tenant_id AND row.import_id=NEW.id
        AND row.validation_status IN ('pending','invalid','duplicate')
    ) THEN
      RAISE EXCEPTION 'people import contains unresolved row decisions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_import_reconciliation_guard ON people_imports;
CREATE TRIGGER people_import_reconciliation_guard
BEFORE UPDATE OF status ON people_imports
FOR EACH ROW EXECUTE FUNCTION app.require_reconciled_people_import();

COMMIT;
