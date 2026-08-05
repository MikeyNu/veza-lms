BEGIN;

CREATE TABLE institution_terminology_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  version_number integer NOT NULL CHECK (version_number > 0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','in_review','approved','retired')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
  description text CHECK (description IS NULL OR length(btrim(description)) BETWEEN 10 AND 2000),
  effective_from date,
  effective_until date,
  submitted_by uuid REFERENCES users(id),
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, locale, version_number),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
  CHECK (lifecycle <> 'in_review' OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)),
  CHECK (lifecycle <> 'approved' OR (
    submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND approved_by IS NOT NULL
    AND approved_at IS NOT NULL AND effective_from IS NOT NULL AND approved_by <> created_by
  )),
  CHECK (approval_notes IS NULL OR length(btrim(approval_notes)) BETWEEN 10 AND 2000)
);
CREATE UNIQUE INDEX institution_terminology_current_approved_uq
  ON institution_terminology_versions (tenant_id, institution_id, locale)
  WHERE lifecycle = 'approved' AND effective_until IS NULL;
CREATE INDEX institution_terminology_effective_idx
  ON institution_terminology_versions (tenant_id, institution_id, locale, effective_from DESC)
  WHERE lifecycle = 'approved';

CREATE TABLE institution_terminology_entries (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  terminology_version_id uuid NOT NULL,
  canonical_key text NOT NULL CHECK (canonical_key IN (
    'learner','staff','guardian','sponsor','programme','qualification','learning-path',
    'subject','module','course','grade','year','level','cohort','class','academic-period','outcome','competency'
  )),
  singular_label text NOT NULL CHECK (length(btrim(singular_label)) BETWEEN 1 AND 80),
  plural_label text NOT NULL CHECK (length(btrim(plural_label)) BETWEEN 1 AND 80),
  short_label text CHECK (short_label IS NULL OR length(btrim(short_label)) BETWEEN 1 AND 40),
  help_text text CHECK (help_text IS NULL OR length(btrim(help_text)) BETWEEN 3 AND 500),
  PRIMARY KEY (tenant_id, terminology_version_id, canonical_key),
  FOREIGN KEY (tenant_id, terminology_version_id)
    REFERENCES institution_terminology_versions(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE programme_hierarchy_levels (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  terminology_version_id uuid NOT NULL,
  level_order integer NOT NULL CHECK (level_order BETWEEN 1 AND 12),
  canonical_type text NOT NULL CHECK (canonical_type IN (
    'programme','qualification','learning-path','subject','module','course','grade','year','level'
  )),
  singular_label text NOT NULL CHECK (length(btrim(singular_label)) BETWEEN 1 AND 80),
  plural_label text NOT NULL CHECK (length(btrim(plural_label)) BETWEEN 1 AND 80),
  is_required boolean NOT NULL DEFAULT true,
  minimum_occurrences integer NOT NULL DEFAULT 0 CHECK (minimum_occurrences >= 0),
  maximum_occurrences integer CHECK (maximum_occurrences IS NULL OR maximum_occurrences > 0),
  PRIMARY KEY (tenant_id, terminology_version_id, level_order),
  UNIQUE (tenant_id, terminology_version_id, canonical_type),
  FOREIGN KEY (tenant_id, terminology_version_id)
    REFERENCES institution_terminology_versions(tenant_id, id) ON DELETE CASCADE,
  CHECK (maximum_occurrences IS NULL OR maximum_occurrences >= minimum_occurrences)
);

CREATE OR REPLACE FUNCTION app.protect_approved_terminology()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle = 'approved' AND (
    NEW.institution_id IS DISTINCT FROM OLD.institution_id OR
    NEW.locale IS DISTINCT FROM OLD.locale OR
    NEW.version_number IS DISTINCT FROM OLD.version_number OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.description IS DISTINCT FROM OLD.description OR
    NEW.effective_from IS DISTINCT FROM OLD.effective_from OR
    NEW.approved_by IS DISTINCT FROM OLD.approved_by OR
    NEW.approved_at IS DISTINCT FROM OLD.approved_at
  ) THEN
    RAISE EXCEPTION 'approved terminology is immutable; create a replacement version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER institution_terminology_versions_immutable
BEFORE UPDATE ON institution_terminology_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_terminology();

CREATE OR REPLACE FUNCTION app.protect_approved_terminology_children()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_lifecycle text;
DECLARE parent_id uuid;
BEGIN
  parent_id := COALESCE(NEW.terminology_version_id, OLD.terminology_version_id);
  SELECT lifecycle INTO parent_lifecycle
  FROM institution_terminology_versions
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id) AND id = parent_id;
  IF parent_lifecycle = 'approved' THEN
    RAISE EXCEPTION 'approved terminology entries and hierarchy are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER institution_terminology_entries_immutable
BEFORE INSERT OR UPDATE OR DELETE ON institution_terminology_entries
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_terminology_children();
CREATE TRIGGER programme_hierarchy_levels_immutable
BEFORE INSERT OR UPDATE OR DELETE ON programme_hierarchy_levels
FOR EACH ROW EXECUTE FUNCTION app.protect_approved_terminology_children();

ALTER TABLE institution_terminology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_terminology_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE institution_terminology_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_terminology_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE programme_hierarchy_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_hierarchy_levels FORCE ROW LEVEL SECURITY;

CREATE POLICY institution_terminology_versions_tenant_isolation ON institution_terminology_versions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY institution_terminology_entries_tenant_isolation ON institution_terminology_entries
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY programme_hierarchy_levels_tenant_isolation ON programme_hierarchy_levels
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  institution_terminology_versions,
  institution_terminology_entries,
  programme_hierarchy_levels
TO veza_app;

COMMIT;
