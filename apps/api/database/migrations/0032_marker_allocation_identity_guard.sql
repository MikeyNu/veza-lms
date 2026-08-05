BEGIN;

CREATE OR REPLACE FUNCTION app.guard_marker_allocation_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE linked_user uuid;
DECLARE allocation_attempt uuid;
BEGIN
  IF TG_TABLE_NAME='marker_allocations' THEN
    SELECT linked_user_id INTO linked_user
    FROM people
    WHERE tenant_id=NEW.tenant_id AND id=NEW.marker_person_id AND status='active';
    IF linked_user IS NULL THEN
      RAISE EXCEPTION 'marker allocation requires an active staff person linked to a user identity';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME='submission_marks' THEN
    SELECT allocation.submission_attempt_id,person.linked_user_id
    INTO allocation_attempt,linked_user
    FROM marker_allocations allocation
    JOIN people person
      ON person.tenant_id=allocation.tenant_id
     AND person.id=allocation.marker_person_id
     AND person.status='active'
    WHERE allocation.tenant_id=NEW.tenant_id
      AND allocation.id=NEW.marker_allocation_id
      AND allocation.status IN ('allocated','accepted');
    IF allocation_attempt IS NULL OR allocation_attempt<>NEW.submission_attempt_id THEN
      RAISE EXCEPTION 'active marker allocation does not match the submission attempt';
    END IF;
    IF linked_user IS NULL OR linked_user<>NEW.created_by THEN
      RAISE EXCEPTION 'mark evidence must be created by the allocated marker identity';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marker_allocations_identity_guard ON marker_allocations;
CREATE TRIGGER marker_allocations_identity_guard
BEFORE INSERT OR UPDATE ON marker_allocations
FOR EACH ROW EXECUTE FUNCTION app.guard_marker_allocation_identity();

DROP TRIGGER IF EXISTS submission_marks_identity_guard ON submission_marks;
CREATE TRIGGER submission_marks_identity_guard
BEFORE INSERT ON submission_marks
FOR EACH ROW EXECUTE FUNCTION app.guard_marker_allocation_identity();

COMMIT;
