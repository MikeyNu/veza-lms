BEGIN;

CREATE OR REPLACE FUNCTION app.enqueue_media_processing(p_asset_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  asset_record record;
  policy_record record;
  inserted integer := 0;
  affected integer := 0;
BEGIN
  SELECT asset.* INTO asset_record
  FROM media_assets asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'media asset was not found'; END IF;

  SELECT * INTO policy_record
  FROM storage_policies
  WHERE id = asset_record.storage_policy_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'media storage policy was not found'; END IF;

  INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
  VALUES (asset_record.tenant_id, p_asset_id, 'verify-object', policy_record.processing_profile)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  inserted := inserted + affected;

  IF policy_record.require_malware_scan THEN
    INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
    VALUES (asset_record.tenant_id, p_asset_id, 'malware-scan', policy_record.processing_profile)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    inserted := inserted + affected;
  ELSE
    UPDATE media_assets SET malware_status = 'not-required' WHERE id = p_asset_id;
  END IF;

  IF asset_record.media_type LIKE 'image/%' THEN
    INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
    VALUES (asset_record.tenant_id, p_asset_id, 'image-renditions', policy_record.processing_profile)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    inserted := inserted + affected;
  ELSIF asset_record.media_type LIKE 'video/%' THEN
    INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
    VALUES
      (asset_record.tenant_id, p_asset_id, 'video-transcode', policy_record.processing_profile),
      (asset_record.tenant_id, p_asset_id, 'caption', policy_record.processing_profile),
      (asset_record.tenant_id, p_asset_id, 'transcript', policy_record.processing_profile)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    inserted := inserted + affected;
  ELSIF asset_record.media_type LIKE 'audio/%' THEN
    INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
    VALUES
      (asset_record.tenant_id, p_asset_id, 'audio-transcode', policy_record.processing_profile),
      (asset_record.tenant_id, p_asset_id, 'transcript', policy_record.processing_profile)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    inserted := inserted + affected;
  END IF;

  IF NOT policy_record.require_accessibility_evidence THEN
    UPDATE media_assets SET accessibility_status = 'not-required' WHERE id = p_asset_id;
  END IF;

  UPDATE media_assets
  SET status = 'processing', version = version + 1, updated_at = now()
  WHERE id = p_asset_id;
  RETURN inserted;
END
$$;

CREATE OR REPLACE FUNCTION app.prepare_media_retention_deletions(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  prepared integer;
BEGIN
  WITH candidates AS (
    SELECT asset.id, asset.tenant_id
    FROM media_assets asset
    JOIN storage_policies policy ON policy.id = asset.storage_policy_id
    WHERE asset.status = 'ready'
      AND NOT asset.legal_hold
      AND policy.retention_days IS NOT NULL
      AND COALESCE(asset.retained_until, asset.created_at + (policy.retention_days * interval '1 day')) <= now()
    ORDER BY COALESCE(asset.retained_until, asset.created_at), asset.id
    FOR UPDATE OF asset SKIP LOCKED
    LIMIT p_limit
  ), requests AS (
    INSERT INTO storage_deletion_requests (
      tenant_id, asset_id, reason, requested_by, execute_after, status
    )
    SELECT candidate.tenant_id,
           candidate.id,
           'Automated retention policy reached its configured expiry.',
           asset.created_by,
           now() + interval '24 hours',
           'requested'
    FROM candidates candidate
    JOIN media_assets asset ON asset.id = candidate.id
    ON CONFLICT (tenant_id, asset_id, status) DO NOTHING
    RETURNING asset_id
  )
  UPDATE media_assets asset
  SET status = 'deletion-pending', version = version + 1, updated_at = now()
  FROM requests
  WHERE asset.id = requests.asset_id;
  GET DIAGNOSTICS prepared = ROW_COUNT;
  RETURN prepared;
END
$$;

REVOKE ALL ON FUNCTION app.enqueue_media_processing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prepare_media_retention_deletions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enqueue_media_processing(uuid) TO veza_app, veza_worker;
GRANT EXECUTE ON FUNCTION app.prepare_media_retention_deletions(integer) TO veza_worker;

COMMIT;
