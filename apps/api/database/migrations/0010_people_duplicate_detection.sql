BEGIN;

CREATE OR REPLACE FUNCTION app.queue_person_duplicate_candidate(
  candidate_left uuid,
  candidate_right uuid,
  candidate_score numeric,
  candidate_reasons jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  left_id uuid := LEAST(candidate_left, candidate_right);
  right_id uuid := GREATEST(candidate_left, candidate_right);
  left_tenant uuid;
  right_tenant uuid;
BEGIN
  IF candidate_left = candidate_right THEN RETURN; END IF;
  SELECT tenant_id INTO left_tenant FROM people WHERE id = left_id;
  SELECT tenant_id INTO right_tenant FROM people WHERE id = right_id;
  IF left_tenant IS NULL OR left_tenant IS DISTINCT FROM right_tenant THEN RETURN; END IF;
  INSERT INTO person_duplicate_candidates (
    id, tenant_id, left_person_id, right_person_id, match_score, match_reasons
  ) VALUES (
    gen_random_uuid(), left_tenant, left_id, right_id,
    LEAST(GREATEST(candidate_score, 0), 1), candidate_reasons
  )
  ON CONFLICT (tenant_id, left_person_id, right_person_id) DO UPDATE SET
    match_score = GREATEST(person_duplicate_candidates.match_score, EXCLUDED.match_score),
    match_reasons = EXCLUDED.match_reasons,
    status = CASE WHEN person_duplicate_candidates.status = 'dismissed' THEN 'open' ELSE person_duplicate_candidates.status END;
END $$;

CREATE OR REPLACE FUNCTION app.detect_person_duplicate_from_contact() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE match record;
BEGIN
  IF NEW.kind <> 'email' OR NEW.valid_until IS NOT NULL THEN RETURN NEW; END IF;
  FOR match IN
    SELECT person_id
    FROM person_contact_points
    WHERE tenant_id = NEW.tenant_id
      AND kind = 'email'
      AND normalized_value = NEW.normalized_value
      AND valid_until IS NULL
      AND person_id <> NEW.person_id
  LOOP
    PERFORM app.queue_person_duplicate_candidate(
      NEW.person_id, match.person_id, 0.9800,
      jsonb_build_array(jsonb_build_object('type','exact-email','value',NEW.normalized_value))
    );
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.detect_person_duplicate_from_identity() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE match record;
BEGIN
  IF NEW.status = 'merged' THEN RETURN NEW; END IF;
  FOR match IN
    SELECT id
    FROM people
    WHERE tenant_id = NEW.tenant_id
      AND id <> NEW.id
      AND status <> 'merged'
      AND lower(legal_given_names) = lower(NEW.legal_given_names)
      AND lower(legal_family_name) = lower(NEW.legal_family_name)
      AND date_of_birth IS NOT DISTINCT FROM NEW.date_of_birth
  LOOP
    PERFORM app.queue_person_duplicate_candidate(
      NEW.id, match.id,
      CASE WHEN NEW.date_of_birth IS NULL THEN 0.8200 ELSE 0.9300 END,
      jsonb_build_array(jsonb_build_object('type','name-and-date-of-birth'))
    );
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER person_contact_duplicate_detection
AFTER INSERT OR UPDATE OF normalized_value, valid_until ON person_contact_points
FOR EACH ROW EXECUTE FUNCTION app.detect_person_duplicate_from_contact();

CREATE TRIGGER person_identity_duplicate_detection
AFTER INSERT OR UPDATE OF legal_given_names, legal_family_name, date_of_birth ON people
FOR EACH ROW EXECUTE FUNCTION app.detect_person_duplicate_from_identity();

REVOKE ALL ON FUNCTION app.queue_person_duplicate_candidate(uuid, uuid, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.detect_person_duplicate_from_contact() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.detect_person_duplicate_from_identity() FROM PUBLIC;

COMMIT;
