BEGIN;

CREATE TABLE tenant_storage_namespaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  namespace_key text NOT NULL CHECK (namespace_key ~ '^[a-z][a-z0-9-]{1,79}$'),
  bucket_key text NOT NULL CHECK (bucket_key ~ '^[a-z0-9][a-z0-9.-]{1,62}$'),
  key_prefix text NOT NULL CHECK (key_prefix ~ '^tenants/[0-9a-f-]{36}/[a-z0-9/_-]+/$'),
  residency_region text NOT NULL,
  kms_key_reference text NOT NULL CHECK (length(kms_key_reference) BETWEEN 3 AND 512),
  cdn_domain text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','read-only','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, namespace_key),
  UNIQUE (bucket_key, key_prefix)
);

CREATE TABLE storage_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_key text NOT NULL CHECK (policy_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9.-]{2,119}$'),
  allowed_media_types text[] NOT NULL CHECK (cardinality(allowed_media_types) > 0),
  maximum_bytes bigint NOT NULL CHECK (maximum_bytes BETWEEN 1 AND 107374182400),
  require_checksum boolean NOT NULL DEFAULT true,
  require_malware_scan boolean NOT NULL DEFAULT true,
  require_accessibility_evidence boolean NOT NULL DEFAULT false,
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 36500),
  legal_hold_capable boolean NOT NULL DEFAULT false,
  processing_profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(processing_profile) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, policy_key)
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid,
  namespace_id uuid NOT NULL,
  storage_policy_id uuid NOT NULL,
  purpose text NOT NULL,
  object_key text NOT NULL CHECK (length(object_key) BETWEEN 10 AND 1024),
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 255),
  media_type text NOT NULL CHECK (length(media_type) BETWEEN 3 AND 160),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 107374182400),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','uploaded','processing','ready','quarantined','failed','deletion-pending','deleted')),
  malware_status text NOT NULL DEFAULT 'pending'
    CHECK (malware_status IN ('pending','clean','infected','failed','not-required')),
  accessibility_status text NOT NULL DEFAULT 'pending'
    CHECK (accessibility_status IN ('pending','complete','not-required','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  legal_hold boolean NOT NULL DEFAULT false,
  retained_until timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, object_key),
  UNIQUE (tenant_id, checksum_sha256, byte_size, purpose),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, namespace_id) REFERENCES tenant_storage_namespaces(tenant_id, id),
  FOREIGN KEY (tenant_id, storage_policy_id) REFERENCES storage_policies(tenant_id, id),
  CHECK (retained_until IS NULL OR retained_until > created_at)
);
CREATE INDEX media_assets_status_idx ON media_assets(tenant_id, status, updated_at);

CREATE TABLE media_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  upload_method text NOT NULL CHECK (upload_method IN ('single-put','multipart','resumable')),
  provider_upload_id text,
  expected_bytes bigint NOT NULL CHECK (expected_bytes > 0),
  acknowledged_bytes bigint NOT NULL DEFAULT 0 CHECK (acknowledged_bytes >= 0),
  expected_checksum text NOT NULL CHECK (expected_checksum ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'created'
    CHECK (state IN ('created','uploading','uploaded','verified','expired','aborted')),
  expires_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_assets(tenant_id, id) ON DELETE CASCADE,
  CHECK (acknowledged_bytes <= expected_bytes)
);

CREATE TABLE media_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  job_type text NOT NULL
    CHECK (job_type IN ('verify-object','malware-scan','image-renditions','video-transcode','audio-transcode','caption','transcript','metadata','delete-object')),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','retry','completed','failed','dead-letter','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  maximum_attempts integer NOT NULL DEFAULT 8 CHECK (maximum_attempts BETWEEN 1 AND 100),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  lease_owner text,
  provider_reference text,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_id, job_type),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_assets(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX media_processing_jobs_claimable_idx
  ON media_processing_jobs(next_attempt_at, created_at, id)
  WHERE state IN ('pending','retry');

CREATE TABLE media_renditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  rendition_key text NOT NULL CHECK (rendition_key ~ '^[a-z][a-z0-9.-]{1,79}$'),
  object_key text NOT NULL,
  media_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  width integer,
  height integer,
  duration_seconds numeric(14,3),
  bitrate integer,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','failed','deleted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_id, rendition_key),
  UNIQUE (tenant_id, object_key),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_assets(tenant_id, id) ON DELETE CASCADE,
  CHECK (width IS NULL OR width > 0),
  CHECK (height IS NULL OR height > 0),
  CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CHECK (bitrate IS NULL OR bitrate > 0)
);

CREATE TABLE media_text_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  track_type text NOT NULL CHECK (track_type IN ('caption','subtitle','transcript','audio-description')),
  language_tag text NOT NULL CHECK (language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  object_key text,
  inline_text text,
  format text NOT NULL CHECK (format IN ('vtt','srt','txt','json')),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  generated_by text NOT NULL CHECK (generated_by IN ('human','provider','import')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','published','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_id, track_type, language_tag, status),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_assets(tenant_id, id) ON DELETE CASCADE,
  CHECK ((object_key IS NOT NULL)::int + (inline_text IS NOT NULL)::int = 1),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL))
);

CREATE TABLE recording_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  subject_person_id uuid NOT NULL,
  recording_context text NOT NULL CHECK (length(btrim(recording_context)) BETWEEN 3 AND 200),
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 10 AND 1000),
  state text NOT NULL CHECK (state IN ('granted','declined','withdrawn','expired')),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  expires_at timestamptz,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  captured_by uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, subject_person_id) REFERENCES people(tenant_id, id),
  CHECK (state <> 'granted' OR granted_at IS NOT NULL),
  CHECK (state <> 'withdrawn' OR withdrawn_at IS NOT NULL)
);

CREATE TABLE storage_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid,
  usage_type text NOT NULL CHECK (usage_type IN ('stored-byte-hour','ingress-byte','egress-byte','transcode-second','scan-object','cdn-request','deletion')),
  quantity numeric(24,6) NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  unit_cost numeric(18,8) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  currency text NOT NULL DEFAULT 'ZAR' CHECK (currency ~ '^[A-Z]{3}$'),
  cost_amount numeric(24,8) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  occurred_at timestamptz NOT NULL,
  source_reference text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (tenant_id, usage_type, source_reference),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_assets(tenant_id, id)
);
CREATE INDEX storage_usage_ledger_tenant_time_idx
  ON storage_usage_ledger(tenant_id, occurred_at DESC);

CREATE TABLE storage_quota_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  maximum_stored_bytes bigint NOT NULL CHECK (maximum_stored_bytes > 0),
  maximum_monthly_egress_bytes bigint NOT NULL CHECK (maximum_monthly_egress_bytes > 0),
  maximum_monthly_transcode_seconds bigint NOT NULL CHECK (maximum_monthly_transcode_seconds >= 0),
  enforcement text NOT NULL DEFAULT 'hard' CHECK (enforcement IN ('observe','soft','hard')),
  warning_threshold numeric(5,4) NOT NULL DEFAULT 0.8 CHECK (warning_threshold > 0 AND warning_threshold <= 1),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE storage_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  execute_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','processing','completed','rejected','blocked')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, asset_id, status),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES media_assets(tenant_id, id),
  CHECK (execute_after >= requested_at),
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_storage_namespaces','storage_policies','media_assets','media_upload_sessions',
    'media_processing_jobs','media_renditions','media_text_tracks','recording_consents',
    'storage_usage_ledger','storage_quota_policies','storage_deletion_requests'
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

CREATE OR REPLACE FUNCTION app.assert_storage_quota(
  p_tenant_id uuid,
  p_additional_bytes bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  policy storage_quota_policies%ROWTYPE;
  current_bytes bigint;
BEGIN
  SELECT * INTO policy FROM storage_quota_policies WHERE tenant_id = p_tenant_id;
  IF NOT FOUND OR policy.enforcement <> 'hard' THEN RETURN; END IF;
  SELECT COALESCE(sum(byte_size),0) INTO current_bytes
  FROM media_assets
  WHERE tenant_id = p_tenant_id AND status NOT IN ('deleted','failed');
  IF current_bytes + p_additional_bytes > policy.maximum_stored_bytes THEN
    RAISE EXCEPTION 'tenant storage quota would be exceeded';
  END IF;
END
$$;

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
  SELECT asset.* INTO asset_record FROM media_assets asset WHERE asset.id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'media asset was not found'; END IF;
  SELECT * INTO policy_record FROM storage_policies WHERE id = asset_record.storage_policy_id;
  INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
  VALUES (asset_record.tenant_id, p_asset_id, 'verify-object', policy_record.processing_profile)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF policy_record.require_malware_scan THEN
    INSERT INTO media_processing_jobs (tenant_id, asset_id, job_type, profile)
    VALUES (asset_record.tenant_id, p_asset_id, 'malware-scan', policy_record.processing_profile)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    inserted := inserted + affected;
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
  UPDATE media_assets SET status = 'processing', version = version + 1, updated_at = now()
  WHERE id = p_asset_id;
  RETURN inserted;
END
$$;

CREATE OR REPLACE FUNCTION app.reconcile_media_asset(p_asset_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  asset_record record;
  policy_record record;
  pending_count integer;
  failed_count integer;
BEGIN
  SELECT asset.* INTO asset_record FROM media_assets asset WHERE asset.id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'media asset was not found'; END IF;
  SELECT * INTO policy_record FROM storage_policies WHERE id = asset_record.storage_policy_id;
  SELECT count(*) FILTER (WHERE state IN ('pending','processing','retry')),
         count(*) FILTER (WHERE state IN ('failed','dead-letter'))
  INTO pending_count, failed_count
  FROM media_processing_jobs WHERE asset_id = p_asset_id;
  IF failed_count > 0 THEN
    UPDATE media_assets SET status = 'failed', version = version + 1, updated_at = now()
    WHERE id = p_asset_id;
    RETURN 'failed';
  END IF;
  IF asset_record.malware_status = 'infected' THEN
    UPDATE media_assets SET status = 'quarantined', version = version + 1, updated_at = now()
    WHERE id = p_asset_id;
    RETURN 'quarantined';
  END IF;
  IF pending_count = 0
     AND (NOT policy_record.require_malware_scan OR asset_record.malware_status = 'clean')
     AND (NOT policy_record.require_accessibility_evidence OR asset_record.accessibility_status = 'complete') THEN
    UPDATE media_assets SET status = 'ready', version = version + 1, updated_at = now()
    WHERE id = p_asset_id;
    RETURN 'ready';
  END IF;
  RETURN asset_record.status;
END
$$;

REVOKE ALL ON FUNCTION app.assert_storage_quota(uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enqueue_media_processing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reconcile_media_asset(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assert_storage_quota(uuid,bigint) TO veza_app;
GRANT EXECUTE ON FUNCTION app.enqueue_media_processing(uuid) TO veza_app, veza_worker;
GRANT EXECUTE ON FUNCTION app.reconcile_media_asset(uuid) TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,'media.retention-reconciliation','media.retention-reconciliation',
  '{"batchSize":100}'::jsonb,3600,now(),'active',NULL
)
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET handler_key = EXCLUDED.handler_key,
    payload = EXCLUDED.payload,
    interval_seconds = EXCLUDED.interval_seconds,
    status = 'active',
    updated_at = now();

COMMIT;
