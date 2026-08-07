BEGIN;

ALTER TABLE tenant_release_assignments
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_until timestamptz,
  ADD COLUMN IF NOT EXISTS is_canary boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenant_release_assignments_effective_period_check
    CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE tenant_feature_flag_overrides
  ADD COLUMN IF NOT EXISTS effective_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS effective_until timestamptz,
  ADD CONSTRAINT tenant_feature_flag_overrides_effective_period_check
    CHECK (effective_until IS NULL OR effective_until > effective_from);

CREATE TABLE platform_release_versions (
  version_key text PRIMARY KEY
    CHECK (version_key ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 160),
  release_notes text NOT NULL CHECK (length(btrim(release_notes)) BETWEEN 20 AND 10000),
  lifecycle text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft','candidate','active','retired','rolled-back')),
  compatibility_floor text
    CHECK (compatibility_floor IS NULL OR compatibility_floor ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  migration_bundle_key text NOT NULL CHECK (migration_bundle_key ~ '^[a-z][a-z0-9._-]{2,159}$'),
  migration_state text NOT NULL DEFAULT 'pending'
    CHECK (migration_state IN ('pending','running','completed','failed','not-required')),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[a-f0-9]{64}$'),
  source_commit_sha text NOT NULL CHECK (source_commit_sha ~ '^[a-f0-9]{40}$'),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (activated_at IS NULL OR approved_at IS NOT NULL),
  CHECK (retired_at IS NULL OR lifecycle IN ('retired','rolled-back'))
);
CREATE INDEX platform_release_versions_lifecycle_idx
  ON platform_release_versions (lifecycle, created_at DESC);

CREATE TABLE release_ring_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ring_key text NOT NULL REFERENCES release_rings(key) ON DELETE RESTRICT,
  release_version text NOT NULL REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  rollout_percent numeric(5,2) NOT NULL DEFAULT 100 CHECK (rollout_percent > 0 AND rollout_percent <= 100),
  lifecycle text NOT NULL DEFAULT 'planned'
    CHECK (lifecycle IN ('planned','active','paused','completed','rolled-back')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);
CREATE UNIQUE INDEX release_ring_one_open_target_idx
  ON release_ring_targets (ring_key)
  WHERE lifecycle IN ('planned','active','paused');
CREATE INDEX release_ring_targets_history_idx
  ON release_ring_targets (ring_key, effective_from DESC, id DESC);

CREATE TABLE tenant_release_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pinned_release_version text REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  excluded_release_version text REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','expired','revoked')),
  created_by uuid NOT NULL REFERENCES users(id),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pinned_release_version IS NOT NULL OR excluded_release_version IS NOT NULL),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (revoked_at IS NULL OR state = 'revoked')
);
CREATE UNIQUE INDEX tenant_one_active_release_exception_idx
  ON tenant_release_exceptions (tenant_id)
  WHERE state = 'active';
CREATE INDEX tenant_release_exceptions_history_idx
  ON tenant_release_exceptions (tenant_id, effective_from DESC, id DESC);

CREATE TABLE release_compatibility_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  current_release_version text REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  target_release_version text NOT NULL REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  compatible boolean NOT NULL,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers) = 'array'),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  checked_by text NOT NULL CHECK (length(btrim(checked_by)) BETWEEN 3 AND 160),
  correlation_id text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, target_release_version, checked_at)
);
CREATE INDEX release_compatibility_reports_tenant_idx
  ON release_compatibility_reports (tenant_id, checked_at DESC, id DESC);

CREATE TABLE tenant_release_migration_status (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_release_version text NOT NULL REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','running','blocked','completed','failed','rolled-back')),
  current_step text,
  completed_steps text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_error text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  updated_by text NOT NULL CHECK (length(btrim(updated_by)) BETWEEN 3 AND 160),
  correlation_id text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, target_release_version),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (state <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX tenant_release_migration_state_idx
  ON tenant_release_migration_status (state, updated_at DESC);

CREATE TABLE release_rollback_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ring_key text REFERENCES release_rings(key) ON DELETE RESTRICT,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  from_release_version text NOT NULL REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  to_release_version text NOT NULL REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  state text NOT NULL DEFAULT 'approved'
    CHECK (state IN ('approved','executing','completed','failed','cancelled')),
  approved_by uuid NOT NULL REFERENCES users(id),
  effective_at timestamptz NOT NULL,
  completed_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ring_key IS NOT NULL OR tenant_id IS NOT NULL),
  CHECK (from_release_version <> to_release_version),
  CHECK (completed_at IS NULL OR completed_at >= created_at)
);
CREATE INDEX release_rollback_decisions_time_idx
  ON release_rollback_decisions (effective_at DESC, id DESC);

ALTER TABLE entitlement_denial_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_denial_diagnostics FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlement_denial_diagnostics_tenant_isolation
  ON entitlement_denial_diagnostics
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
GRANT INSERT ON entitlement_denial_diagnostics TO veza_app;

CREATE OR REPLACE FUNCTION app.current_tenant_entitlements()
RETURNS TABLE (
  module_key text,
  state text,
  limits jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH tenant_context AS (
    SELECT app.current_tenant_id() tenant_id
    WHERE app.current_tenant_id() IS NOT NULL
  ),
  baseline AS (
    SELECT entitlement.module_key, entitlement.state, entitlement.limits,
           entitlement.valid_from, entitlement.valid_until
    FROM tenant_entitlements entitlement
    JOIN tenant_context context ON context.tenant_id = entitlement.tenant_id
    WHERE entitlement.valid_from <= now()
      AND (entitlement.valid_until IS NULL OR entitlement.valid_until > now())
  ),
  active_override AS (
    SELECT DISTINCT ON (override.module_key)
           override.module_key, override.state, override.limits,
           override.effective_from valid_from,
           override.effective_until valid_until
    FROM tenant_entitlement_overrides override
    JOIN tenant_context context ON context.tenant_id = override.tenant_id
    WHERE override.effective_from <= now()
      AND (override.effective_until IS NULL OR override.effective_until > now())
    ORDER BY override.module_key, override.effective_from DESC, override.created_at DESC
  )
  SELECT COALESCE(active_override.module_key, baseline.module_key),
         COALESCE(active_override.state, baseline.state),
         COALESCE(active_override.limits, baseline.limits),
         COALESCE(active_override.valid_from, baseline.valid_from),
         COALESCE(active_override.valid_until, baseline.valid_until),
         CASE WHEN active_override.module_key IS NULL THEN 'plan' ELSE 'override' END
  FROM baseline
  FULL OUTER JOIN active_override USING (module_key)
  ORDER BY COALESCE(active_override.module_key, baseline.module_key)
$$;
REVOKE ALL ON FUNCTION app.current_tenant_entitlements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_tenant_entitlements() TO veza_app;

CREATE OR REPLACE FUNCTION app.current_feature_flags()
RETURNS TABLE (
  flag_key text,
  enabled boolean,
  source text,
  ring_key text,
  configuration_version integer,
  required_module_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH tenant_context AS (
    SELECT app.current_tenant_id() AS tenant_id
    WHERE app.current_tenant_id() IS NOT NULL
  ),
  selected_ring AS (
    SELECT COALESCE(assignment.ring_key, 'general-availability') AS ring_key
    FROM tenant_context context
    LEFT JOIN tenant_release_assignments assignment
      ON assignment.tenant_id = context.tenant_id
     AND assignment.effective_from <= now()
     AND (assignment.effective_until IS NULL OR assignment.effective_until > now())
  ),
  active_entitlements AS (
    SELECT entitlement.module_key
    FROM app.current_tenant_entitlements() entitlement
    WHERE entitlement.state IN ('enabled','trial')
  )
  SELECT
    flag.key,
    CASE
      WHEN flag.required_module_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM active_entitlements item WHERE item.module_key = flag.required_module_key)
        THEN false
      ELSE COALESCE(tenant_override.enabled, ring_setting.enabled, flag.default_enabled)
    END,
    CASE
      WHEN flag.required_module_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM active_entitlements item WHERE item.module_key = flag.required_module_key)
        THEN 'entitlement'
      WHEN tenant_override.feature_flag_key IS NOT NULL THEN 'tenant-override'
      WHEN ring_setting.feature_flag_key IS NOT NULL THEN 'release-ring'
      ELSE 'default'
    END,
    selected_ring.ring_key,
    GREATEST(flag.version, COALESCE(ring_setting.version, 0), COALESCE(tenant_override.version, 0)),
    flag.required_module_key
  FROM feature_flags flag
  CROSS JOIN selected_ring
  LEFT JOIN release_ring_feature_flags ring_setting
    ON ring_setting.ring_key = selected_ring.ring_key
   AND ring_setting.feature_flag_key = flag.key
  LEFT JOIN tenant_context context ON true
  LEFT JOIN tenant_feature_flag_overrides tenant_override
    ON tenant_override.tenant_id = context.tenant_id
   AND tenant_override.feature_flag_key = flag.key
   AND tenant_override.effective_from <= now()
   AND (tenant_override.effective_until IS NULL OR tenant_override.effective_until > now())
  WHERE flag.lifecycle = 'active'
  ORDER BY flag.key
$$;
REVOKE ALL ON FUNCTION app.current_feature_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_feature_flags() TO veza_app;

CREATE OR REPLACE FUNCTION app.record_entitlement_denial(
  p_module_key text,
  p_capability_key text,
  p_denial_code text,
  p_reason_summary text,
  p_request_context jsonb,
  p_correlation_id text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE denial_id uuid;
DECLARE tenant_id uuid := app.current_tenant_id();
BEGIN
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context is required to record entitlement denial';
  END IF;
  INSERT INTO entitlement_denial_diagnostics (
    tenant_id, module_key, capability_key, denial_code,
    reason_summary, request_context, correlation_id, actor_id
  ) VALUES (
    tenant_id, p_module_key, p_capability_key, p_denial_code,
    p_reason_summary, COALESCE(p_request_context, '{}'::jsonb), p_correlation_id, p_actor_id
  ) RETURNING id INTO denial_id;
  RETURN denial_id;
END
$$;
REVOKE ALL ON FUNCTION app.record_entitlement_denial(text,text,text,text,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_entitlement_denial(text,text,text,text,jsonb,text,uuid) TO veza_app;

CREATE OR REPLACE FUNCTION app.expire_support_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE system_actor uuid;
DECLARE session_record record;
DECLARE expired_count integer := 0;
BEGIN
  SELECT id INTO system_actor
  FROM users
  WHERE identity_issuer = 'https://control.veza.invalid/system'
    AND identity_subject = 'scheduled-jobs-bootstrap'
  LIMIT 1;
  IF system_actor IS NULL THEN
    RAISE EXCEPTION 'Scheduled-job system identity is unavailable';
  END IF;

  FOR session_record IN
    UPDATE support_elevation_sessions
       SET state = 'expired', terminated_at = now(),
           termination_reason = 'Customer-approved support window expired'
     WHERE state = 'active' AND expires_at <= now()
     RETURNING id, support_case_id, tenant_id, operator_id, correlation_id, expires_at
  LOOP
    expired_count := expired_count + 1;
    INSERT INTO support_session_events (
      support_session_id, event_type, actor_id, resource_type,
      resource_id, purpose, correlation_id, evidence
    ) VALUES (
      session_record.id, 'expired', system_actor, 'support-session',
      session_record.id::text, 'Customer-approved support window expired',
      session_record.correlation_id,
      jsonb_build_object(
        'tenantId', session_record.tenant_id,
        'operatorId', session_record.operator_id,
        'approvedExpiry', session_record.expires_at
      )
    );
  END LOOP;

  UPDATE support_cases case_record
     SET state = 'approved', version = version + 1
   WHERE state = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM support_elevation_sessions session
       WHERE session.support_case_id = case_record.id
         AND session.state = 'active'
         AND session.expires_at > now()
     );

  RETURN jsonb_build_object('expiredSessions', expired_count);
END
$$;
REVOKE ALL ON FUNCTION app.expire_support_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expire_support_sessions() TO veza_worker, veza_control;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'platform_release_versions','release_ring_targets','tenant_release_exceptions',
    'release_compatibility_reports','tenant_release_migration_status',
    'release_rollback_decisions'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, veza_app', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO veza_control', table_name);
  END LOOP;
END
$$;
GRANT SELECT, INSERT, UPDATE ON release_compatibility_reports, tenant_release_migration_status TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, maximum_attempts, created_by
)
SELECT
  NULL, 'support.session-expiry', 'support.session-expiry', '{}'::jsonb,
  60, now(), 'active', 8, bootstrap_user.id
FROM users bootstrap_user
WHERE bootstrap_user.identity_issuer = 'https://control.veza.invalid/system'
  AND bootstrap_user.identity_subject = 'scheduled-jobs-bootstrap'
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET handler_key = EXCLUDED.handler_key,
    interval_seconds = EXCLUDED.interval_seconds,
    status = 'active',
    updated_at = now(),
    version = scheduled_jobs.version + 1;

COMMIT;
