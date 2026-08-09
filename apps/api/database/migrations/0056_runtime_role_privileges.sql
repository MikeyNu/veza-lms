BEGIN;

-- Runtime roles can execute only functions explicitly granted elsewhere, but
-- PostgreSQL also requires schema usage before any app.* function is callable.
GRANT USAGE ON SCHEMA app TO veza_app, veza_control, veza_worker;

-- The people migrations established RLS and policies but omitted table ACLs.
-- The application role still remains tenant-bound by FORCE ROW LEVEL SECURITY.
GRANT SELECT, INSERT, UPDATE ON
  people,
  person_contact_points,
  person_addresses,
  learner_profiles,
  staff_profiles,
  person_identifiers,
  person_organisational_assignments,
  person_relationships,
  person_consents,
  person_disclosure_restrictions,
  person_duplicate_candidates,
  person_merges,
  people_imports,
  people_import_rows
TO veza_app;

COMMIT;
