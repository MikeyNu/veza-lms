BEGIN;

CREATE TABLE course_announcements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
  audience jsonb NOT NULL DEFAULT '{"scope":"course-run"}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','withdrawn')),
  publish_at timestamptz,
  expires_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(audience) = 'object'),
  CHECK (octet_length(audience::text) <= 32768),
  CHECK (expires_at IS NULL OR publish_at IS NULL OR expires_at > publish_at)
);
CREATE INDEX course_announcements_delivery_idx
  ON course_announcements (tenant_id, course_run_id, status, publish_at DESC);

CREATE TABLE course_discussions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  lesson_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  prompt text NOT NULL CHECK (length(btrim(prompt)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','locked','archived')),
  available_from timestamptz,
  available_until timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id) ON DELETE SET NULL,
  CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from)
);

CREATE TABLE course_discussion_posts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  discussion_id uuid NOT NULL,
  author_person_id uuid NOT NULL,
  parent_post_id uuid,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden','deleted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, discussion_id) REFERENCES course_discussions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, author_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, parent_post_id) REFERENCES course_discussion_posts(tenant_id, id)
);
CREATE INDEX course_discussion_posts_thread_idx
  ON course_discussion_posts (tenant_id, discussion_id, created_at, id);

CREATE TABLE learner_bookmarks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  block_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, learner_person_id, enrolment_id, lesson_id, block_id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id),
  CHECK (block_id IS NULL OR length(btrim(block_id)) BETWEEN 1 AND 160),
  CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 2000)
);

CREATE TABLE learner_completion_evidence (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'viewed','acknowledged','activity-completed','discussion-posted',
    'assignment-submitted','manual-completion','external-evidence'
  )),
  evidence_key text NOT NULL CHECK (length(btrim(evidence_key)) BETWEEN 1 AND 200),
  evidence jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, enrolment_id, lesson_id, evidence_type, evidence_key),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, lesson_id) REFERENCES studio_lessons(tenant_id, id),
  CHECK (jsonb_typeof(evidence) = 'object'),
  CHECK (octet_length(evidence::text) <= 262144)
);
CREATE INDEX learner_completion_evidence_progress_idx
  ON learner_completion_evidence (tenant_id, enrolment_id, lesson_id, occurred_at);

CREATE TABLE learner_progress_snapshots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  publication_snapshot_id uuid NOT NULL,
  evidence_checksum text NOT NULL CHECK (evidence_checksum ~ '^[a-f0-9]{64}$'),
  completed_lessons integer NOT NULL CHECK (completed_lessons >= 0),
  total_lessons integer NOT NULL CHECK (total_lessons >= 0),
  progress_percent numeric(7,4) NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
  next_lesson_id uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computation jsonb NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, enrolment_id, publication_snapshot_id, evidence_checksum),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, publication_snapshot_id) REFERENCES studio_publication_snapshots(tenant_id, id),
  FOREIGN KEY (tenant_id, next_lesson_id) REFERENCES studio_lessons(tenant_id, id),
  CHECK (jsonb_typeof(computation) = 'object'),
  CHECK (octet_length(computation::text) <= 524288)
);
CREATE INDEX learner_progress_latest_idx
  ON learner_progress_snapshots (tenant_id, enrolment_id, computed_at DESC);

CREATE TABLE learner_offline_manifests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  publication_snapshot_id uuid NOT NULL,
  manifest_checksum text NOT NULL CHECK (manifest_checksum ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, learner_person_id, enrolment_id, publication_snapshot_id, manifest_checksum),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, publication_snapshot_id) REFERENCES studio_publication_snapshots(tenant_id, id),
  CHECK (jsonb_typeof(manifest) = 'object'),
  CHECK (octet_length(manifest::text) <= 16777216),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE learner_sync_operations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  device_operation_id text NOT NULL CHECK (length(btrim(device_operation_id)) BETWEEN 8 AND 200),
  operation_type text NOT NULL CHECK (operation_type IN ('bookmark','completion','discussion-post')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','rejected','applied')),
  rejection_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, learner_person_id, device_operation_id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (octet_length(payload::text) <= 262144),
  CHECK (rejection_reason IS NULL OR length(btrim(rejection_reason)) BETWEEN 10 AND 1000)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'course_announcements','course_discussions','course_discussion_posts',
    'learner_bookmarks','learner_completion_evidence','learner_progress_snapshots',
    'learner_offline_manifests','learner_sync_operations'
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
  course_announcements,
  course_discussions,
  course_discussion_posts,
  learner_bookmarks,
  learner_sync_operations
TO veza_app;
GRANT SELECT, INSERT ON
  learner_completion_evidence,
  learner_progress_snapshots,
  learner_offline_manifests
TO veza_app;

COMMIT;
