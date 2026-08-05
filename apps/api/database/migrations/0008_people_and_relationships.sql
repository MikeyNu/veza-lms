BEGIN;

CREATE TYPE person_record_status AS ENUM ('active', 'inactive', 'deceased', 'merged');
CREATE TYPE learner_profile_status AS ENUM ('prospective', 'active', 'suspended', 'withdrawn', 'completed', 'archived');
CREATE TYPE staff_profile_status AS ENUM ('active', 'on_leave', 'suspended', 'ended', 'archived');
CREATE TYPE person_relationship_type AS ENUM ('guardian', 'sponsor', 'employer', 'advisor', 'emergency_contact', 'authorised_contact');
CREATE TYPE consent_status AS ENUM ('granted', 'withheld', 'withdrawn', 'expired');
CREATE TYPE duplicate_review_status AS ENUM ('open', 'confirmed_distinct', 'merge_approved', 'dismissed');
CREATE TYPE person_merge_status AS ENUM ('completed', 'reversed');

CREATE TABLE people (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  linked_user_id uuid REFERENCES users(id),
  preferred_name text,
  legal_given_names text NOT NULL,
  legal_family_name text NOT NULL,
  date_of_birth date,
  status person_record_status NOT NULL DEFAULT 'active',
  locale text NOT NULL DEFAULT 'en-ZA',
  source_system text,
  source_reference text,
  merged_into_person_id uuid REFERENCES people(id),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (length(trim(legal_given_names)) BETWEEN 1 AND 200),
  CHECK (length(trim(legal_family_name)) BETWEEN 1 AND 200),
  CHECK (preferred_name IS NULL OR length(trim(preferred_name)) BETWEEN 1 AND 120),
  CHECK ((status = 'merged') = (merged_into_person_id IS NOT NULL)),
  CHECK (merged_into_person_id IS NULL OR merged_into_person_id <> id),
  UNIQUE (tenant_id, source_system, source_reference)
);

CREATE UNIQUE INDEX people_linked_user_per_tenant_uq
  ON people (tenant_id, linked_user_id)
  WHERE linked_user_id IS NOT NULL AND status <> 'merged';
CREATE INDEX people_tenant_name_idx ON people (tenant_id, legal_family_name, legal_given_names);
CREATE INDEX people_tenant_status_idx ON people (tenant_id, status);

CREATE TABLE person_contact_points (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email', 'mobile', 'telephone')),
  value text NOT NULL,
  normalized_value text NOT NULL,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verification_recorded_at timestamptz,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(normalized_value) BETWEEN 3 AND 320),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE UNIQUE INDEX person_primary_contact_uq
  ON person_contact_points (tenant_id, person_id, kind)
  WHERE is_primary AND valid_until IS NULL;
CREATE INDEX person_contact_lookup_idx ON person_contact_points (tenant_id, kind, normalized_value);

CREATE TABLE person_addresses (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN ('residential', 'postal', 'work', 'other')),
  address jsonb NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(address) = 'object'),
  CHECK (octet_length(address::text) <= 16384),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE UNIQUE INDEX person_primary_address_uq
  ON person_addresses (tenant_id, person_id, address_type)
  WHERE is_primary AND valid_until IS NULL;

CREATE TABLE learner_profiles (
  person_id uuid PRIMARY KEY REFERENCES people(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  status learner_profile_status NOT NULL DEFAULT 'prospective',
  admission_date date,
  exit_date date,
  support_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(support_profile) = 'object'),
  CHECK (octet_length(support_profile::text) <= 32768),
  CHECK (exit_date IS NULL OR admission_date IS NULL OR exit_date >= admission_date)
);
CREATE INDEX learner_profiles_institution_status_idx ON learner_profiles (tenant_id, institution_id, status);

CREATE TABLE staff_profiles (
  person_id uuid PRIMARY KEY REFERENCES people(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  status staff_profile_status NOT NULL DEFAULT 'active',
  engagement_type text NOT NULL CHECK (engagement_type IN ('employee', 'contractor', 'volunteer', 'external')),
  started_on date,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);
CREATE INDEX staff_profiles_institution_status_idx ON staff_profiles (tenant_id, institution_id, status);

CREATE TABLE person_identifiers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES institutions(id),
  identifier_type text NOT NULL,
  identifier_value text NOT NULL,
  normalized_value text NOT NULL,
  issuing_authority text,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(identifier_type)) BETWEEN 1 AND 80),
  CHECK (length(normalized_value) BETWEEN 1 AND 200),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE UNIQUE INDEX person_identifier_active_uq
  ON person_identifiers (tenant_id, identifier_type, normalized_value)
  WHERE valid_until IS NULL;

CREATE TABLE person_organisational_assignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  organisational_unit_id uuid NOT NULL REFERENCES organisational_units(id),
  assignment_type text NOT NULL,
  title text,
  is_primary boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL,
  valid_until date,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(assignment_type)) BETWEEN 1 AND 80),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX person_assignments_active_idx
  ON person_organisational_assignments (tenant_id, institution_id, organisational_unit_id, person_id)
  WHERE valid_until IS NULL;

CREATE TABLE person_relationships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  subject_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  related_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  institution_id uuid REFERENCES institutions(id),
  relationship_type person_relationship_type NOT NULL,
  authority jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id),
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revocation_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subject_person_id <> related_person_id),
  CHECK (jsonb_typeof(authority) = 'object'),
  CHECK (octet_length(authority::text) <= 16384),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CHECK (revocation_reason IS NULL OR length(trim(revocation_reason)) BETWEEN 10 AND 500)
);
CREATE INDEX person_relationships_subject_idx ON person_relationships (tenant_id, subject_person_id, relationship_type);
CREATE INDEX person_relationships_related_idx ON person_relationships (tenant_id, related_person_id, relationship_type);

CREATE TABLE person_consents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  relationship_id uuid REFERENCES person_relationships(id),
  purpose_code text NOT NULL,
  status consent_status NOT NULL,
  evidence jsonb NOT NULL,
  granted_at timestamptz,
  expires_at timestamptz,
  withdrawn_at timestamptz,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(purpose_code)) BETWEEN 1 AND 120),
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (octet_length(evidence::text) <= 32768),
  CHECK (status <> 'granted' OR granted_at IS NOT NULL),
  CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL),
  CHECK (expires_at IS NULL OR granted_at IS NULL OR expires_at >= granted_at)
);
CREATE INDEX person_consents_current_idx ON person_consents (tenant_id, person_id, purpose_code, created_at DESC);

CREATE TABLE person_disclosure_restrictions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  restriction_code text NOT NULL,
  reason text NOT NULL,
  applies_to_relationship_types person_relationship_type[] NOT NULL DEFAULT '{}',
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  lifted_by uuid REFERENCES users(id),
  lifted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK ((lifted_by IS NULL) = (lifted_at IS NULL))
);
CREATE INDEX person_disclosure_active_idx ON person_disclosure_restrictions (tenant_id, person_id, effective_from DESC);

CREATE TABLE person_duplicate_candidates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  left_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  right_person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  match_score numeric(5,4) NOT NULL CHECK (match_score BETWEEN 0 AND 1),
  match_reasons jsonb NOT NULL,
  status duplicate_review_status NOT NULL DEFAULT 'open',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_person_id <> right_person_id),
  CHECK (left_person_id::text < right_person_id::text),
  CHECK (jsonb_typeof(match_reasons) = 'array'),
  CHECK (octet_length(match_reasons::text) <= 16384),
  UNIQUE (tenant_id, left_person_id, right_person_id)
);
CREATE INDEX person_duplicate_open_idx ON person_duplicate_candidates (tenant_id, match_score DESC) WHERE status = 'open';

CREATE TABLE person_merges (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  surviving_person_id uuid NOT NULL REFERENCES people(id),
  merged_person_id uuid NOT NULL REFERENCES people(id),
  duplicate_candidate_id uuid REFERENCES person_duplicate_candidates(id),
  status person_merge_status NOT NULL DEFAULT 'completed',
  merge_plan jsonb NOT NULL,
  reversal_plan jsonb NOT NULL,
  reason text NOT NULL,
  approved_by uuid NOT NULL REFERENCES users(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  reversed_by uuid REFERENCES users(id),
  reversed_at timestamptz,
  reversal_reason text,
  CHECK (surviving_person_id <> merged_person_id),
  CHECK (jsonb_typeof(merge_plan) = 'object'),
  CHECK (jsonb_typeof(reversal_plan) = 'object'),
  CHECK (octet_length(merge_plan::text) <= 65536),
  CHECK (octet_length(reversal_plan::text) <= 65536),
  CHECK (length(trim(reason)) BETWEEN 20 AND 1000),
  CHECK ((status = 'reversed') = (reversed_at IS NOT NULL AND reversed_by IS NOT NULL)),
  UNIQUE (tenant_id, merged_person_id)
);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE people FORCE ROW LEVEL SECURITY;
ALTER TABLE person_contact_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_contact_points FORCE ROW LEVEL SECURITY;
ALTER TABLE person_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE person_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_identifiers FORCE ROW LEVEL SECURITY;
ALTER TABLE person_organisational_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_organisational_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE person_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE person_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE person_disclosure_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_disclosure_restrictions FORCE ROW LEVEL SECURITY;
ALTER TABLE person_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_duplicate_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE person_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_merges FORCE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'people','person_contact_points','person_addresses','learner_profiles','staff_profiles',
    'person_identifiers','person_organisational_assignments','person_relationships','person_consents',
    'person_disclosure_restrictions','person_duplicate_candidates','person_merges'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      table_name, table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION enforce_people_tenant_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE referenced_tenant uuid;
BEGIN
  IF TG_TABLE_NAME = 'people' AND NEW.merged_into_person_id IS NOT NULL THEN
    SELECT tenant_id INTO referenced_tenant FROM people WHERE id = NEW.merged_into_person_id;
    IF referenced_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'merged person must belong to the same tenant'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER people_tenant_reference_guard BEFORE INSERT OR UPDATE ON people
FOR EACH ROW EXECUTE FUNCTION enforce_people_tenant_references();

COMMIT;
