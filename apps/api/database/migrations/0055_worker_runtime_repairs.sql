BEGIN;

-- Scheduled governance functions record immutable evidence against this actor.
-- Platform schedules became actorless in 0053, but the functions still require
-- a stable user identity whenever they write audit records.
INSERT INTO users (
  identity_issuer,
  identity_subject,
  display_name,
  status
) VALUES (
  'https://control.veza.invalid/system',
  'scheduled-jobs-bootstrap',
  'Scheduled Jobs',
  'active'
)
ON CONFLICT (identity_issuer, identity_subject) DO UPDATE
SET display_name = EXCLUDED.display_name,
    status = 'active',
    updated_at = now();

-- PostgreSQL has no min(uuid) aggregate. Cast only the deterministic ordering
-- key; the UUID remains unchanged everywhere it is persisted or joined.
CREATE OR REPLACE FUNCTION app.prepare_notification_digests(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  prepared integer;
BEGIN
  WITH grouped AS (
    SELECT item.tenant_id,
           item.recipient_key,
           item.channel,
           item.frequency,
           jsonb_agg(
             jsonb_build_object(
               'intentId', intent.id,
               'templateKey', intent.template_key,
               'topicKey', intent.topic_key,
               'variables', intent.variables,
               'createdAt', intent.created_at
             ) ORDER BY intent.created_at, intent.id
           ) AS items,
           (array_agg(intent.recipient_snapshot ORDER BY intent.created_at, intent.id))[1]
             AS recipient_snapshot
    FROM notification_digest_items item
    JOIN notification_intents intent
      ON intent.tenant_id = item.tenant_id
     AND intent.id = item.notification_intent_id
    WHERE item.status = 'pending'
      AND item.due_at <= now()
    GROUP BY item.tenant_id, item.recipient_key, item.channel, item.frequency
    ORDER BY min(item.due_at), min(item.id::text)
    LIMIT p_limit
  ), inserted AS (
    INSERT INTO notification_digest_batches (
      tenant_id, recipient_key, channel, frequency,
      recipient_snapshot, item_snapshot
    )
    SELECT tenant_id, recipient_key, channel, frequency,
           recipient_snapshot, items
    FROM grouped
    RETURNING tenant_id, recipient_key, channel, frequency
  ), updated AS (
    UPDATE notification_digest_items item
    SET status = 'batched'
    FROM inserted
    WHERE item.tenant_id = inserted.tenant_id
      AND item.recipient_key = inserted.recipient_key
      AND item.channel = inserted.channel
      AND item.frequency = inserted.frequency
      AND item.status = 'pending'
      AND item.due_at <= now()
    RETURNING item.id
  )
  SELECT count(*) INTO prepared FROM updated;
  RETURN prepared;
END
$$;

-- people has preferred/legal name fields, not a display_name column.
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
    concat_ws(' ',person.preferred_name,person.legal_given_names,person.legal_family_name),
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

COMMIT;
