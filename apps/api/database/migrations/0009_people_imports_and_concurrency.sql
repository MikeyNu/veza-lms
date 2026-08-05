BEGIN;

CREATE TABLE people_imports (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  source_filename text NOT NULL CHECK (length(source_filename) BETWEEN 1 AND 240),
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('uploaded','validating','ready','committing','completed','failed')),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  duplicate_rows integer NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_code text,
  UNIQUE (tenant_id, source_checksum),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, id)
);

CREATE TABLE people_import_rows (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  raw_record jsonb NOT NULL CHECK (jsonb_typeof(raw_record) = 'object' AND octet_length(raw_record::text) <= 65536),
  normalized_record jsonb CHECK (normalized_record IS NULL OR (jsonb_typeof(normalized_record) = 'object' AND octet_length(normalized_record::text) <= 32768)),
  validation_status text NOT NULL CHECK (validation_status IN ('pending','valid','invalid','duplicate','committed')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array' AND octet_length(validation_errors::text) <= 32768),
  matched_person_id uuid,
  committed_person_id uuid,
  committed_at timestamptz,
  UNIQUE (tenant_id, import_id, row_number),
  FOREIGN KEY (tenant_id, import_id) REFERENCES people_imports(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, matched_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, committed_person_id) REFERENCES people(tenant_id, id)
);

CREATE INDEX people_directory_name_idx ON people (tenant_id, lower(legal_family_name), lower(legal_given_names), id) WHERE merged_into_person_id IS NULL;
CREATE INDEX people_directory_email_idx ON person_contact_points (tenant_id, lower(normalized_value)) WHERE kind = 'email' AND valid_until IS NULL;
CREATE INDEX people_import_rows_status_idx ON people_import_rows (tenant_id, import_id, validation_status, row_number);

ALTER TABLE people_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_imports FORCE ROW LEVEL SECURITY;
ALTER TABLE people_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_import_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY people_imports_tenant_isolation ON people_imports USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY people_import_rows_tenant_isolation ON people_import_rows USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
