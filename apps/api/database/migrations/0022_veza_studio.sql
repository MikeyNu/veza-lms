BEGIN;

CREATE TABLE studio_templates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 160),
  description text CHECK (description IS NULL OR length(btrim(description)) BETWEEN 10 AND 2000),
  template_kind text NOT NULL CHECK (template_kind IN ('course','module','lesson','activity')),
  block_document jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  CHECK (jsonb_typeof(block_document) = 'array'),
  CHECK (octet_length(block_document::text) <= 2097152)
);

CREATE UNIQUE INDEX studio_templates_name_kind_uq
  ON studio_templates (tenant_id, institution_id, lower(name), template_kind);

CREATE TABLE studio_course_spaces (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_blueprint_version_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_blueprint_version_id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_blueprint_version_id)
    REFERENCES course_blueprint_versions(tenant_id, id)
);

CREATE TABLE studio_modules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_space_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  description text CHECK (description IS NULL OR length(btrim(description)) BETWEEN 10 AND 4000),
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  availability_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_space_id, sequence_number),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_space_id) REFERENCES studio_course_spaces(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(availability_rule) = 'object'),
  CHECK (jsonb_typeof(completion_rule) = 'object'),
  CHECK (octet_length(availability_rule::text) <= 32768),
  CHECK (octet_length(completion_rule::text) <= 32768)
);

CREATE TABLE studio_lessons (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_space_id uuid NOT NULL,
  module_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  summary text CHECK (summary IS NULL OR length(btrim(summary)) BETWEEN 10 AND 2000),
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  lesson_type text NOT NULL DEFAULT 'lesson'
    CHECK (lesson_type IN ('lesson','resource','activity','discussion','assignment-link')),
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 1440),
  availability_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','published','retired')),
  current_revision_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, module_id, sequence_number),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_space_id) REFERENCES studio_course_spaces(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, module_id) REFERENCES studio_modules(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(availability_rule) = 'object'),
  CHECK (jsonb_typeof(completion_rule) = 'object'),
  CHECK (octet_length(availability_rule::text) <= 32768),
  CHECK (octet_length(completion_rule::text) <= 32768)
);

CREATE TABLE studio_reusable_blocks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 160),
  block_type text NOT NULL CHECK (block_type IN (
    'heading','paragraph','callout','quote','image','video','audio','file','embed',
    'table','columns','accordion','tabs','divider','code','equation','quiz','activity','outcome'
  )),
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  CHECK (jsonb_typeof(content) = 'object'),
  CHECK (octet_length(content::text) <= 262144)
);

CREATE UNIQUE INDEX studio_reusable_blocks_name_uq
  ON studio_reusable_blocks (tenant_id, institution_id, lower(name));

CREATE TABLE studio_assets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_space_id uuid,
  asset_kind text NOT NULL CHECK (asset_kind IN ('image','video','audio','document','archive','other')),
  object_key text NOT NULL CHECK (length(btrim(object_key)) BETWEEN 3 AND 1024),
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 255),
  media_type text NOT NULL CHECK (length(btrim(media_type)) BETWEEN 3 AND 160),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 0 AND 5368709120),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  malware_status text NOT NULL DEFAULT 'pending'
    CHECK (malware_status IN ('pending','clean','infected','failed')),
  alt_text text,
  caption_text text,
  transcript_text text,
  duration_seconds numeric(12,3),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','ready','quarantined','deleted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, object_key),
  UNIQUE (tenant_id, checksum_sha256, size_bytes),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_space_id) REFERENCES studio_course_spaces(tenant_id, id) ON DELETE SET NULL,
  CHECK (alt_text IS NULL OR length(btrim(alt_text)) BETWEEN 1 AND 1000),
  CHECK (caption_text IS NULL OR length(btrim(caption_text)) BETWEEN 1 AND 10000),
  CHECK (transcript_text IS NULL OR length(btrim(transcript_text)) BETWEEN 1 AND 1048576),
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (octet_length(metadata::text) <= 262144)
);

CREATE TABLE studio_lesson_revisions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  based_on_revision_id uuid,
  block_document jsonb NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  change_summary text NOT NULL CHECK (length(btrim(change_summary)) BETWEEN 10 AND 2000),
  accessibility_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  link_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  reading_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, lesson_id, revision_number),
  UNIQUE (tenant_id, lesson_id, checksum_sha256),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, based_on_revision_id) REFERENCES studio_lesson_revisions(tenant_id, id),
  CHECK (jsonb_typeof(block_document) = 'array'),
  CHECK (jsonb_typeof(accessibility_report) = 'object'),
  CHECK (jsonb_typeof(link_report) = 'object'),
  CHECK (jsonb_typeof(reading_metrics) = 'object'),
  CHECK (octet_length(block_document::text) <= 4194304),
  CHECK (octet_length(accessibility_report::text) <= 262144),
  CHECK (octet_length(link_report::text) <= 262144),
  CHECK (octet_length(reading_metrics::text) <= 32768)
);

ALTER TABLE studio_lessons
  ADD CONSTRAINT studio_lessons_current_revision_fk
  FOREIGN KEY (tenant_id, current_revision_id)
  REFERENCES studio_lesson_revisions(tenant_id, id);

CREATE TABLE studio_lesson_outcomes (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL,
  learning_outcome_id uuid NOT NULL,
  evidence_level text NOT NULL CHECK (evidence_level IN ('introduced','developed','mastered','assessed')),
  PRIMARY KEY (tenant_id, lesson_id, learning_outcome_id),
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, learning_outcome_id) REFERENCES learning_outcomes(tenant_id, id)
);

CREATE TABLE studio_revision_assets (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  block_id text NOT NULL CHECK (length(btrim(block_id)) BETWEEN 1 AND 160),
  usage_role text NOT NULL CHECK (usage_role IN ('inline','download','poster','caption','transcript','attachment')),
  PRIMARY KEY (tenant_id, revision_id, asset_id, block_id, usage_role),
  FOREIGN KEY (tenant_id, revision_id) REFERENCES studio_lesson_revisions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES studio_assets(tenant_id, id)
);

CREATE TABLE studio_comments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  block_id text,
  parent_comment_id uuid,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','reopened','deleted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, revision_id) REFERENCES studio_lesson_revisions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, parent_comment_id) REFERENCES studio_comments(tenant_id, id),
  CHECK (block_id IS NULL OR length(btrim(block_id)) BETWEEN 1 AND 160),
  CHECK ((resolved_by IS NULL) = (resolved_at IS NULL))
);

CREATE TABLE studio_review_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','changes-requested','approved','cancelled')),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  decision_notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, revision_id) REFERENCES studio_lesson_revisions(tenant_id, id),
  CHECK (decision_notes IS NULL OR length(btrim(decision_notes)) BETWEEN 10 AND 2000),
  CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by <> requested_by)
);
CREATE UNIQUE INDEX studio_review_one_pending_idx
  ON studio_review_requests (tenant_id, lesson_id)
  WHERE status = 'pending';

CREATE TABLE studio_publication_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_space_id uuid NOT NULL,
  publication_number integer NOT NULL CHECK (publication_number > 0),
  source_review_id uuid NOT NULL,
  manifest jsonb NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  supersedes_snapshot_id uuid,
  rollback_of_snapshot_id uuid,
  status text NOT NULL DEFAULT 'current' CHECK (status IN ('current','superseded','revoked')),
  revocation_reason text,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_space_id, publication_number),
  UNIQUE (tenant_id, course_space_id, checksum_sha256),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_space_id) REFERENCES studio_course_spaces(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_review_id) REFERENCES studio_review_requests(tenant_id, id),
  FOREIGN KEY (tenant_id, supersedes_snapshot_id) REFERENCES studio_publication_snapshots(tenant_id, id),
  FOREIGN KEY (tenant_id, rollback_of_snapshot_id) REFERENCES studio_publication_snapshots(tenant_id, id),
  CHECK (jsonb_typeof(manifest) = 'object'),
  CHECK (octet_length(manifest::text) <= 16777216),
  CHECK (revocation_reason IS NULL OR length(btrim(revocation_reason)) BETWEEN 10 AND 2000)
);
CREATE UNIQUE INDEX studio_publication_one_current_idx
  ON studio_publication_snapshots (tenant_id, course_space_id)
  WHERE status = 'current';

CREATE TABLE studio_import_reports (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_space_id uuid,
  source_format text NOT NULL CHECK (source_format IN ('common-cartridge','canvas','moodle','scorm','veza-json')),
  source_checksum text NOT NULL CHECK (source_checksum ~ '^[a-f0-9]{64}$'),
  compatibility_status text NOT NULL CHECK (compatibility_status IN ('compatible','compatible-with-warnings','incompatible')),
  report jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, institution_id, source_checksum),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_space_id) REFERENCES studio_course_spaces(tenant_id, id) ON DELETE SET NULL,
  CHECK (jsonb_typeof(report) = 'object'),
  CHECK (octet_length(report::text) <= 2097152)
);

CREATE OR REPLACE FUNCTION app.protect_studio_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'studio lesson revisions are immutable';
END;
$$;
CREATE TRIGGER studio_lesson_revisions_immutable
BEFORE UPDATE OR DELETE ON studio_lesson_revisions
FOR EACH ROW EXECUTE FUNCTION app.protect_studio_revision();

CREATE OR REPLACE FUNCTION app.protect_publication_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.manifest IS DISTINCT FROM OLD.manifest
     OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
     OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.source_review_id IS DISTINCT FROM OLD.source_review_id
     OR NEW.publication_number IS DISTINCT FROM OLD.publication_number THEN
    RAISE EXCEPTION 'publication snapshot content is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER studio_publication_snapshots_immutable
BEFORE UPDATE ON studio_publication_snapshots
FOR EACH ROW EXECUTE FUNCTION app.protect_publication_snapshot();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'studio_templates','studio_course_spaces','studio_modules','studio_lessons',
    'studio_reusable_blocks','studio_assets','studio_lesson_revisions',
    'studio_lesson_outcomes','studio_revision_assets','studio_comments',
    'studio_review_requests','studio_publication_snapshots','studio_import_reports'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name, table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON
  studio_templates,
  studio_course_spaces,
  studio_modules,
  studio_lessons,
  studio_reusable_blocks,
  studio_assets,
  studio_comments,
  studio_review_requests,
  studio_publication_snapshots,
  studio_import_reports
TO veza_app;
GRANT SELECT, INSERT ON
  studio_lesson_revisions,
  studio_lesson_outcomes,
  studio_revision_assets
TO veza_app;

COMMIT;
