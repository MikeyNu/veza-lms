BEGIN;

CREATE TABLE search_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_key text NOT NULL CHECK (length(document_key) BETWEEN 10 AND 240),
  entity_type text NOT NULL CHECK (entity_type ~ '^[a-z][a-z0-9-]{1,79}$'),
  entity_id uuid NOT NULL,
  institution_id uuid,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
  subtitle text,
  body text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_roles text[] NOT NULL CHECK (cardinality(allowed_roles) > 0),
  visibility jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(visibility) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  suggestion_weight integer NOT NULL DEFAULT 10 CHECK (suggestion_weight BETWEEN 0 AND 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  source_version integer NOT NULL DEFAULT 1 CHECK (source_version > 0),
  projection_generation uuid NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(subtitle,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(keywords,' '),'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body,'')), 'C')
  ) STORED,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, document_key),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id)
);
CREATE INDEX search_documents_vector_idx ON search_documents USING gin(search_vector);
CREATE INDEX search_documents_filters_idx
  ON search_documents(tenant_id, status, entity_type, institution_id, suggestion_weight DESC);
CREATE INDEX search_documents_title_prefix_idx
  ON search_documents(tenant_id, lower(title) text_pattern_ops);

CREATE TABLE search_index_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert','delete')),
  document_snapshot jsonb NOT NULL CHECK (jsonb_typeof(document_snapshot) = 'object'),
  document_checksum text NOT NULL CHECK (document_checksum ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','retry','completed','dead-letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  maximum_attempts integer NOT NULL DEFAULT 12 CHECK (maximum_attempts BETWEEN 1 AND 100),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  lease_owner text,
  provider_reference text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, document_id, document_checksum),
  FOREIGN KEY (tenant_id, document_id) REFERENCES search_documents(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX search_index_operations_claimable_idx
  ON search_index_operations(next_attempt_at, created_at, id)
  WHERE state IN ('pending','retry');

CREATE TABLE search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  term text NOT NULL CHECK (length(btrim(term)) BETWEEN 2 AND 120),
  synonyms text[] NOT NULL CHECK (cardinality(synonyms) > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lower(term))
);

CREATE TABLE search_query_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  query_hash text NOT NULL CHECK (query_hash ~ '^[a-f0-9]{64}$'),
  query_length integer NOT NULL CHECK (query_length BETWEEN 0 AND 500),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  result_count integer NOT NULL CHECK (result_count >= 0),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_query_events_tenant_time_idx
  ON search_query_events(tenant_id, occurred_at DESC);

CREATE TABLE search_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('processing','completed','failed')),
  upserted_count integer NOT NULL DEFAULT 0,
  deleted_count integer NOT NULL DEFAULT 0,
  external_pending_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  UNIQUE (tenant_id, generation_id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'search_documents','search_index_operations','search_synonyms',
    'search_query_events','search_reconciliation_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name,
      table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO veza_app', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO veza_worker', table_name);
    EXECUTE format('GRANT SELECT ON %I TO veza_control', table_name);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION app.queue_search_document_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot jsonb;
  checksum text;
BEGIN
  snapshot := jsonb_build_object(
    'documentKey', NEW.document_key,
    'tenantId', NEW.tenant_id,
    'entityType', NEW.entity_type,
    'entityId', NEW.entity_id,
    'institutionId', NEW.institution_id,
    'title', NEW.title,
    'subtitle', NEW.subtitle,
    'body', NEW.body,
    'keywords', NEW.keywords,
    'allowedRoles', NEW.allowed_roles,
    'visibility', NEW.visibility,
    'metadata', NEW.metadata,
    'suggestionWeight', NEW.suggestion_weight,
    'status', NEW.status,
    'sourceVersion', NEW.source_version,
    'updatedAt', NEW.updated_at
  );
  checksum := encode(digest(snapshot::text, 'sha256'), 'hex');
  INSERT INTO search_index_operations (
    tenant_id, document_id, operation, document_snapshot, document_checksum
  ) VALUES (
    NEW.tenant_id, NEW.id,
    CASE WHEN NEW.status = 'deleted' THEN 'delete' ELSE 'upsert' END,
    snapshot, checksum
  )
  ON CONFLICT (tenant_id, document_id, document_checksum) DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER search_document_change_queue
AFTER INSERT OR UPDATE OF title, subtitle, body, keywords, allowed_roles,
  visibility, metadata, suggestion_weight, status, source_version
ON search_documents
FOR EACH ROW EXECUTE FUNCTION app.queue_search_document_change();

CREATE OR REPLACE FUNCTION app.upsert_search_document(
  p_tenant_id uuid,
  p_generation uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_institution_id uuid,
  p_title text,
  p_subtitle text,
  p_body text,
  p_keywords text[],
  p_allowed_roles text[],
  p_visibility jsonb,
  p_metadata jsonb,
  p_weight integer,
  p_source_version integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  document_id uuid;
  key_value text := p_tenant_id::text || ':' || p_entity_type || ':' || p_entity_id::text;
BEGIN
  INSERT INTO search_documents (
    tenant_id, document_key, entity_type, entity_id, institution_id,
    title, subtitle, body, keywords, allowed_roles, visibility,
    metadata, suggestion_weight, status, source_version, projection_generation
  ) VALUES (
    p_tenant_id, key_value, p_entity_type, p_entity_id, p_institution_id,
    p_title, p_subtitle, COALESCE(p_body,''), COALESCE(p_keywords,ARRAY[]::text[]),
    p_allowed_roles, COALESCE(p_visibility,'{}'::jsonb), COALESCE(p_metadata,'{}'::jsonb),
    p_weight, 'active', p_source_version, p_generation
  )
  ON CONFLICT (tenant_id, document_key)
  DO UPDATE SET institution_id = EXCLUDED.institution_id,
                title = EXCLUDED.title,
                subtitle = EXCLUDED.subtitle,
                body = EXCLUDED.body,
                keywords = EXCLUDED.keywords,
                allowed_roles = EXCLUDED.allowed_roles,
                visibility = EXCLUDED.visibility,
                metadata = EXCLUDED.metadata,
                suggestion_weight = EXCLUDED.suggestion_weight,
                status = 'active',
                source_version = EXCLUDED.source_version,
                projection_generation = EXCLUDED.projection_generation,
                indexed_at = now(),
                updated_at = now()
  RETURNING id INTO document_id;
  RETURN document_id;
END
$$;

CREATE OR REPLACE FUNCTION app.refresh_search_projection(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  generation uuid := gen_random_uuid();
  run_id uuid := gen_random_uuid();
  affected integer := 0;
  changed integer := 0;
  deleted integer := 0;
BEGIN
  INSERT INTO search_reconciliation_runs (
    id, tenant_id, generation_id, state
  ) VALUES (run_id, p_tenant_id, generation, 'processing');

  PERFORM app.upsert_search_document(
    person.tenant_id, generation, 'person', person.id, NULL,
    COALESCE(NULLIF(person.display_name,''), concat_ws(' ',person.preferred_name,person.legal_given_names,person.legal_family_name)),
    'Person · ' || person.status,
    concat_ws(' ',person.legal_given_names,person.legal_family_name,person.preferred_name),
    ARRAY[person.legal_given_names,person.legal_family_name,COALESCE(person.preferred_name,'')],
    ARRAY['tenant-owner','institution-admin','registrar','course-manager','instructor','assessor','moderator','auditor'],
    jsonb_build_object('status',person.status),
    jsonb_build_object('href','/people/' || person.id::text),
    80,
    person.version
  ) FROM people person
  WHERE person.tenant_id = p_tenant_id AND person.status <> 'merged';
  GET DIAGNOSTICS changed = ROW_COUNT;
  affected := affected + changed;

  PERFORM app.upsert_search_document(
    programme.tenant_id, generation, 'programme-version', version.id, programme.institution_id,
    version.title,
    programme.code || ' · ' || programme.programme_type,
    COALESCE(version.description,''),
    ARRAY[programme.code,programme.programme_type,version.lifecycle],
    CASE WHEN version.lifecycle = 'approved'
      THEN ARRAY['tenant-owner','institution-admin','registrar','curriculum-manager','course-manager','instructor','learner','auditor']
      ELSE ARRAY['tenant-owner','institution-admin','curriculum-manager','course-manager','auditor'] END,
    jsonb_build_object('lifecycle',version.lifecycle,'programmeType',programme.programme_type),
    jsonb_build_object('href','/catalogue?programmeVersionId=' || version.id::text),
    CASE WHEN version.lifecycle = 'approved' THEN 95 ELSE 50 END,
    version.version
  ) FROM programme_versions version
  JOIN programmes programme ON programme.id = version.programme_id
  WHERE programme.tenant_id = p_tenant_id AND version.lifecycle <> 'retired';
  GET DIAGNOSTICS changed = ROW_COUNT;
  affected := affected + changed;

  PERFORM app.upsert_search_document(
    definition.tenant_id, generation, 'course-blueprint', version.id, definition.institution_id,
    version.title,
    definition.code || ' · ' || definition.definition_type,
    COALESCE(version.description,''),
    ARRAY[definition.code,definition.definition_type,COALESCE(definition.subject_area,''),version.lifecycle],
    CASE WHEN version.lifecycle = 'approved'
      THEN ARRAY['tenant-owner','institution-admin','registrar','curriculum-manager','course-manager','instructor','learner','auditor']
      ELSE ARRAY['tenant-owner','institution-admin','curriculum-manager','course-manager','auditor'] END,
    jsonb_build_object('lifecycle',version.lifecycle,'definitionType',definition.definition_type),
    jsonb_build_object('href','/catalogue?blueprintVersionId=' || version.id::text),
    CASE WHEN version.lifecycle = 'approved' THEN 100 ELSE 55 END,
    version.version
  ) FROM course_blueprint_versions version
  JOIN course_definitions definition ON definition.id = version.course_definition_id
  WHERE definition.tenant_id = p_tenant_id AND version.lifecycle <> 'retired';
  GET DIAGNOSTICS changed = ROW_COUNT;
  affected := affected + changed;

  PERFORM app.upsert_search_document(
    run.tenant_id, generation, 'course-run', run.id, run.institution_id,
    run.title,
    run.code || ' · ' || run.delivery_mode,
    concat_ws(' ',run.lifecycle,run.starts_on::text,run.ends_on::text),
    ARRAY[run.code,run.delivery_mode,run.lifecycle],
    ARRAY['tenant-owner','institution-admin','registrar','course-manager','instructor','assessor','moderator','learner','auditor'],
    jsonb_build_object('lifecycle',run.lifecycle,'deliveryMode',run.delivery_mode),
    jsonb_build_object('href','/courses?courseRunId=' || run.id::text),
    85,
    run.version
  ) FROM course_runs run
  WHERE run.tenant_id = p_tenant_id AND run.lifecycle <> 'cancelled';
  GET DIAGNOSTICS changed = ROW_COUNT;
  affected := affected + changed;

  PERFORM app.upsert_search_document(
    lesson.tenant_id, generation, 'studio-lesson', lesson.id, lesson.institution_id,
    lesson.title,
    'Lesson · ' || lesson.status,
    concat_ws(' ',lesson.summary,revision.block_document::text),
    ARRAY[lesson.lesson_type,lesson.status],
    CASE WHEN lesson.status = 'published'
      THEN ARRAY['tenant-owner','institution-admin','curriculum-manager','course-manager','instructor','learner','auditor']
      ELSE ARRAY['tenant-owner','institution-admin','curriculum-manager','course-manager','auditor'] END,
    jsonb_build_object('status',lesson.status,'courseSpaceId',lesson.course_space_id),
    jsonb_build_object('href','/studio/lessons/' || lesson.id::text),
    CASE WHEN lesson.status = 'published' THEN 90 ELSE 45 END,
    lesson.version
  ) FROM studio_lessons lesson
  LEFT JOIN studio_lesson_revisions revision ON revision.id = lesson.current_revision_id
  WHERE lesson.tenant_id = p_tenant_id AND lesson.status <> 'retired';
  GET DIAGNOSTICS changed = ROW_COUNT;
  affected := affected + changed;

  PERFORM app.upsert_search_document(
    asset.tenant_id, generation, 'media-asset', asset.id, asset.institution_id,
    asset.original_filename,
    asset.media_type || ' · ' || asset.purpose,
    concat_ws(' ',asset.metadata->>'caption',asset.metadata->>'altText'),
    ARRAY[asset.media_type,asset.purpose],
    ARRAY['tenant-owner','institution-admin','curriculum-manager','course-manager','instructor','auditor'],
    jsonb_build_object('status',asset.status,'purpose',asset.purpose),
    jsonb_build_object('href','/admin/storage?assetId=' || asset.id::text),
    35,
    asset.version
  ) FROM media_assets asset
  WHERE asset.tenant_id = p_tenant_id AND asset.status = 'ready';
  GET DIAGNOSTICS changed = ROW_COUNT;
  affected := affected + changed;

  UPDATE search_documents
  SET status = 'deleted', projection_generation = generation, updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND status = 'active'
    AND projection_generation <> generation;
  GET DIAGNOSTICS deleted = ROW_COUNT;

  UPDATE search_reconciliation_runs
  SET state = 'completed', upserted_count = affected, deleted_count = deleted,
      external_pending_count = (
        SELECT count(*) FROM search_index_operations
        WHERE tenant_id = p_tenant_id AND state IN ('pending','retry','processing')
      ),
      completed_at = now()
  WHERE id = run_id;

  RETURN jsonb_build_object(
    'runId',run_id,
    'generationId',generation,
    'upserted',affected,
    'deleted',deleted
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE search_reconciliation_runs
  SET state = 'failed', last_error = left(SQLERRM,2000), completed_at = now()
  WHERE id = run_id;
  RAISE;
END
$$;

REVOKE ALL ON FUNCTION app.upsert_search_document(
  uuid,uuid,text,uuid,uuid,text,text,text,text[],text[],jsonb,jsonb,integer,integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.refresh_search_projection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.upsert_search_document(
  uuid,uuid,text,uuid,uuid,text,text,text,text[],text[],jsonb,jsonb,integer,integer
) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.refresh_search_projection(uuid) TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
)
SELECT tenant.id,
       'search.projection-reconciliation',
       'search.projection-reconciliation',
       jsonb_build_object('tenantId',tenant.id),
       300,
       now(),
       'active',
       tenant.created_by
FROM tenants tenant
WHERE tenant.status = 'active'
ON CONFLICT (tenant_id, job_key) DO NOTHING;

COMMIT;
