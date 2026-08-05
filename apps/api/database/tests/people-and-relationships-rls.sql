-- Runtime acceptance gate for migration 0008_people_and_relationships.sql.
-- Execute as the application role after the standard integration-test fixture has
-- created two tenants and users. The transaction must roll back in every environment.

BEGIN;

DO $$
DECLARE
  tenant_a uuid := gen_random_uuid();
  tenant_b uuid := gen_random_uuid();
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  person_a uuid := gen_random_uuid();
  leaked_count integer;
BEGIN
  INSERT INTO plans (id, code, display_name, status)
  VALUES (gen_random_uuid(), 'PEOPLE_RLS_' || substr(tenant_a::text, 1, 8), 'People RLS fixture', 'active');

  INSERT INTO users (id, email, display_name, status)
  VALUES
    (user_a, 'people-a-' || substr(user_a::text, 1, 8) || '@example.invalid', 'People A', 'active'),
    (user_b, 'people-b-' || substr(user_b::text, 1, 8) || '@example.invalid', 'People B', 'active');

  INSERT INTO tenants (id, plan_id, slug, display_name, status)
  SELECT tenant_a, id, 'people-a-' || substr(tenant_a::text, 1, 8), 'People tenant A', 'active'
  FROM plans WHERE code = 'PEOPLE_RLS_' || substr(tenant_a::text, 1, 8);

  INSERT INTO tenants (id, plan_id, slug, display_name, status)
  SELECT tenant_b, id, 'people-b-' || substr(tenant_b::text, 1, 8), 'People tenant B', 'active'
  FROM plans WHERE code = 'PEOPLE_RLS_' || substr(tenant_a::text, 1, 8);

  PERFORM set_config('app.tenant_id', tenant_a::text, true);
  INSERT INTO people (
    id, tenant_id, legal_given_names, legal_family_name, created_by, updated_by
  ) VALUES (
    person_a, tenant_a, 'Tenant', 'Alpha', user_a, user_a
  );

  PERFORM set_config('app.tenant_id', tenant_b::text, true);
  SELECT count(*) INTO leaked_count FROM people WHERE id = person_a;
  IF leaked_count <> 0 THEN
    RAISE EXCEPTION 'people RLS leaked a record across tenants';
  END IF;

  BEGIN
    UPDATE people SET preferred_name = 'Leaked' WHERE id = person_a;
    GET DIAGNOSTICS leaked_count = ROW_COUNT;
    IF leaked_count <> 0 THEN
      RAISE EXCEPTION 'people RLS permitted a cross-tenant update';
    END IF;
  END;

  BEGIN
    INSERT INTO person_contact_points (
      id, tenant_id, person_id, kind, value, normalized_value
    ) VALUES (
      gen_random_uuid(), tenant_b, person_a, 'email', 'leak@example.invalid', 'leak@example.invalid'
    );
    RAISE EXCEPTION 'cross-tenant child reference was accepted';
  EXCEPTION
    WHEN foreign_key_violation OR insufficient_privilege OR check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
