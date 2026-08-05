BEGIN;

CREATE OR REPLACE FUNCTION require_same_tenant(reference_table regclass, reference_id uuid, expected_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE actual_tenant uuid;
BEGIN
  EXECUTE format('SELECT tenant_id FROM %s WHERE id = $1', reference_table)
    INTO actual_tenant USING reference_id;
  IF actual_tenant IS NULL THEN
    RAISE foreign_key_violation USING MESSAGE = format('Referenced record %s does not exist', reference_id);
  END IF;
  IF actual_tenant <> expected_tenant THEN
    RAISE insufficient_privilege USING MESSAGE = 'Cross-tenant reference is not permitted';
  END IF;
END $$;

REVOKE ALL ON FUNCTION require_same_tenant(regclass, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION guard_people_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'people' THEN
      IF NEW.merged_into_person_id IS NOT NULL THEN
        PERFORM require_same_tenant('people'::regclass, NEW.merged_into_person_id, NEW.tenant_id);
      END IF;
    WHEN 'person_contact_points', 'person_addresses', 'person_identifiers',
         'person_disclosure_restrictions', 'person_consents' THEN
      PERFORM require_same_tenant('people'::regclass, NEW.person_id, NEW.tenant_id);
      IF TG_TABLE_NAME = 'person_consents' AND NEW.relationship_id IS NOT NULL THEN
        PERFORM require_same_tenant('person_relationships'::regclass, NEW.relationship_id, NEW.tenant_id);
      END IF;
      IF TG_TABLE_NAME = 'person_identifiers' AND NEW.institution_id IS NOT NULL THEN
        PERFORM require_same_tenant('institutions'::regclass, NEW.institution_id, NEW.tenant_id);
      END IF;
    WHEN 'learner_profiles', 'staff_profiles' THEN
      PERFORM require_same_tenant('people'::regclass, NEW.person_id, NEW.tenant_id);
      PERFORM require_same_tenant('institutions'::regclass, NEW.institution_id, NEW.tenant_id);
    WHEN 'person_organisational_assignments' THEN
      PERFORM require_same_tenant('people'::regclass, NEW.person_id, NEW.tenant_id);
      PERFORM require_same_tenant('institutions'::regclass, NEW.institution_id, NEW.tenant_id);
      PERFORM require_same_tenant('organisational_units'::regclass, NEW.organisational_unit_id, NEW.tenant_id);
    WHEN 'person_relationships' THEN
      PERFORM require_same_tenant('people'::regclass, NEW.subject_person_id, NEW.tenant_id);
      PERFORM require_same_tenant('people'::regclass, NEW.related_person_id, NEW.tenant_id);
      IF NEW.institution_id IS NOT NULL THEN
        PERFORM require_same_tenant('institutions'::regclass, NEW.institution_id, NEW.tenant_id);
      END IF;
    WHEN 'person_duplicate_candidates' THEN
      PERFORM require_same_tenant('people'::regclass, NEW.left_person_id, NEW.tenant_id);
      PERFORM require_same_tenant('people'::regclass, NEW.right_person_id, NEW.tenant_id);
    WHEN 'person_merges' THEN
      PERFORM require_same_tenant('people'::regclass, NEW.surviving_person_id, NEW.tenant_id);
      PERFORM require_same_tenant('people'::regclass, NEW.merged_person_id, NEW.tenant_id);
      IF NEW.duplicate_candidate_id IS NOT NULL THEN
        PERFORM require_same_tenant('person_duplicate_candidates'::regclass, NEW.duplicate_candidate_id, NEW.tenant_id);
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported people tenant reference table: %', TG_TABLE_NAME;
  END CASE;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION guard_people_tenant_references() FROM PUBLIC;

DROP TRIGGER IF EXISTS people_tenant_reference_guard ON people;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'people','person_contact_points','person_addresses','learner_profiles','staff_profiles',
    'person_identifiers','person_organisational_assignments','person_relationships','person_consents',
    'person_disclosure_restrictions','person_duplicate_candidates','person_merges'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_people_tenant_reference_guard ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_people_tenant_reference_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_people_tenant_references()',
      table_name, table_name
    );
  END LOOP;
END $$;

COMMIT;
