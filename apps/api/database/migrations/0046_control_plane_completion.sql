BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS branding_status text NOT NULL DEFAULT 'not-configured'
    CHECK (branding_status IN ('not-configured','draft','verified','action-required')),
  ADD COLUMN IF NOT EXISTS identity_provider_status text NOT NULL DEFAULT 'not-configured'
    CHECK (identity_provider_status IN ('not-configured','pending','verified','degraded','action-required')),
  ADD COLUMN IF NOT EXISTS operational_version integer NOT NULL DEFAULT 1 CHECK (operational_version > 0);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_unique_idx
  ON tenants (lower(custom_domain)) WHERE custom_domain IS NOT NULL;

CREATE TABLE tenant_operational_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  health_status text NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('unknown','healthy','degraded','critical','maintenance')),
  health_summary text,
  quota_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quota_policy) = 'object'),
  usage_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage_summary) = 'object'),
  support_contacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(support_contacts) = 'array'),
  commercial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(commercial_metadata) = 'object'),
  last_health_check_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenant_operational_profiles (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE tenant_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  transition text NOT NULL CHECK (transition IN (
    'activated','suspended','resumed','offboarding-started','closed',
    'region-changed','deployment-tier-changed','domain-changed',
    'branding-status-changed','identity-provider-status-changed'
  )),
  from_status text,
  to_status text,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  effective_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES users(id),
  correlation_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_lifecycle_events_tenant_time_idx
  ON tenant_lifecycle_events (tenant_id, occurred_at DESC, id DESC);

CREATE TABLE tenant_export_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  export_type text NOT NULL CHECK (export_type IN ('full-tenant','audit','identity','learning-records','media-manifest')),
  status text NOT NULL CHECK (status IN ('requested','processing','completed','failed','expired')),
  storage_reference text,
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  correlation_id text NOT NULL,
  CHECK (completed_at IS NULL OR completed_at >= requested_at),
  CHECK (expires_at IS NULL OR expires_at > requested_at),
  CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND storage_reference IS NOT NULL AND checksum_sha256 IS NOT NULL))
);
CREATE INDEX tenant_export_receipts_tenant_time_idx
  ON tenant_export_receipts (tenant_id, requested_at DESC, id DESC);

CREATE TABLE tenant_retention_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  hold_type text NOT NULL CHECK (hold_type IN ('legal','security','customer-request','regulatory','billing-dispute')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired')),
  reference text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  released_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  released_by uuid REFERENCES users(id),
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK (released_at IS NULL OR released_at >= starts_at)
);
CREATE INDEX tenant_retention_holds_active_idx
  ON tenant_retention_holds (tenant_id, starts_at DESC)
  WHERE status = 'active';

CREATE TABLE tenant_deletion_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  scheduled_for timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','blocked-by-hold','cancelled','executing','completed','failed')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  export_receipt_id uuid NOT NULL REFERENCES tenant_export_receipts(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id),
  cancelled_by uuid REFERENCES users(id),
  completed_at timestamptz,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_for >= created_at + interval '24 hours'),
  CHECK (completed_at IS NULL OR completed_at >= created_at)
);
CREATE UNIQUE INDEX tenant_one_open_deletion_schedule_idx
  ON tenant_deletion_schedules (tenant_id)
  WHERE state IN ('scheduled','blocked-by-hold','executing');

CREATE TABLE tenant_usage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  active_learners bigint NOT NULL DEFAULT 0 CHECK (active_learners >= 0),
  active_staff bigint NOT NULL DEFAULT 0 CHECK (active_staff >= 0),
  storage_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  api_requests bigint NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
  media_minutes numeric(18,2) NOT NULL DEFAULT 0 CHECK (media_minutes >= 0),
  custom_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom_metrics) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'platform',
  UNIQUE (tenant_id, period_start, period_end),
  CHECK (period_end > period_start)
);
CREATE INDEX tenant_usage_snapshots_tenant_period_idx
  ON tenant_usage_snapshots (tenant_id, period_end DESC);

CREATE TABLE tenant_usage_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  warning_value numeric(20,4) NOT NULL CHECK (warning_value >= 0),
  critical_value numeric(20,4) NOT NULL CHECK (critical_value >= warning_value),
  enforcement text NOT NULL DEFAULT 'notify' CHECK (enforcement IN ('notify','soft-deny','hard-deny')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);
CREATE UNIQUE INDEX tenant_usage_thresholds_current_idx
  ON tenant_usage_thresholds (tenant_id, metric_key)
  WHERE effective_until IS NULL;

CREATE TABLE tenant_billing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9.-]{2,79}$'),
  external_customer_reference text NOT NULL,
  external_subscription_reference text,
  billing_state text NOT NULL DEFAULT 'linked'
    CHECK (billing_state IN ('linked','trial','past-due','suspended','cancelled')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);
CREATE UNIQUE INDEX tenant_billing_links_current_idx
  ON tenant_billing_links (tenant_id, provider_key)
  WHERE effective_until IS NULL;

CREATE TABLE tenant_entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('enabled','disabled','trial')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  billing_reference text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);
CREATE INDEX tenant_entitlement_overrides_lookup_idx
  ON tenant_entitlement_overrides (tenant_id, module_key, effective_from DESC);

CREATE TABLE tenant_entitlement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  module_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('plan','override','trial','billing','operator','migration')),
  previous_state jsonb,
  resulting_state jsonb NOT NULL CHECK (jsonb_typeof(resulting_state) = 'object'),
  reason text NOT NULL,
  effective_at timestamptz NOT NULL,
  actor_id uuid REFERENCES users(id),
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_entitlement_history_tenant_time_idx
  ON tenant_entitlement_history (tenant_id, occurred_at DESC, id DESC);

CREATE TABLE entitlement_denial_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  capability_key text NOT NULL,
  denial_code text NOT NULL,
  reason_summary text NOT NULL,
  request_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_context) = 'object'),
  correlation_id text NOT NULL,
  actor_id uuid REFERENCES users(id),
  denied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entitlement_denial_diagnostics_tenant_time_idx
  ON entitlement_denial_diagnostics (tenant_id, denied_at DESC, id DESC);

CREATE TABLE support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key text NOT NULL UNIQUE CHECK (case_key ~ '^SUP-[0-9]{4}-[A-Z0-9]{6,12}$'),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 200),
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 10 AND 2000),
  requested_scope text[] NOT NULL CHECK (cardinality(requested_scope) > 0),
  state text NOT NULL DEFAULT 'awaiting-customer-approval'
    CHECK (state IN ('awaiting-customer-approval','approved','active','resolved','rejected','cancelled')),
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','high','security-incident')),
  customer_contact jsonb NOT NULL CHECK (jsonb_typeof(customer_contact) = 'object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  correlation_id text NOT NULL
);
CREATE INDEX support_cases_tenant_state_idx
  ON support_cases (tenant_id, state, created_at DESC);

CREATE TABLE support_case_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','revoked')),
  customer_approver_name text NOT NULL,
  customer_approver_email citext NOT NULL,
  approval_reference text NOT NULL,
  approved_scope text[] NOT NULL CHECK (cardinality(approved_scope) > 0),
  expires_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  correlation_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > recorded_at)
);
CREATE INDEX support_case_approvals_case_time_idx
  ON support_case_approvals (support_case_id, recorded_at DESC);

CREATE TABLE support_elevation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES users(id),
  approval_id uuid NOT NULL REFERENCES support_case_approvals(id) ON DELETE RESTRICT,
  granted_scope text[] NOT NULL CHECK (cardinality(granted_scope) > 0),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','expired','terminated')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  terminated_at timestamptz,
  termination_reason text,
  correlation_id text NOT NULL,
  assisted_session_indicator text NOT NULL DEFAULT 'VEZA SUPPORT ACTIVE',
  CHECK (expires_at > started_at),
  CHECK (expires_at <= started_at + interval '8 hours'),
  CHECK (terminated_at IS NULL OR terminated_at >= started_at)
);
CREATE UNIQUE INDEX support_one_active_operator_session_idx
  ON support_elevation_sessions (tenant_id, operator_id)
  WHERE state = 'active';
CREATE INDEX support_elevation_sessions_expiry_idx
  ON support_elevation_sessions (expires_at) WHERE state = 'active';

CREATE TABLE support_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_session_id uuid NOT NULL REFERENCES support_elevation_sessions(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'started','scope-used','customer-notified','terminated','expired','access-denied'
  )),
  actor_id uuid NOT NULL REFERENCES users(id),
  resource_type text,
  resource_id text,
  purpose text NOT NULL,
  correlation_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_session_events_session_time_idx
  ON support_session_events (support_session_id, occurred_at DESC, id DESC);

CREATE TABLE platform_security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key text NOT NULL UNIQUE CHECK (incident_key ~ '^SEC-[0-9]{4}-[A-Z0-9]{6,12}$'),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  support_case_id uuid REFERENCES support_cases(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  category text NOT NULL,
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 10 AND 2000),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','contained','resolved','closed')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  reported_by uuid NOT NULL REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  correlation_id text NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  contained_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX platform_security_incidents_state_time_idx
  ON platform_security_incidents (state, reported_at DESC);

CREATE OR REPLACE FUNCTION app.enforce_tenant_close_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant_export_receipts receipt
      WHERE receipt.tenant_id = NEW.id
        AND receipt.export_type = 'full-tenant'
        AND receipt.status = 'completed'
        AND receipt.completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'A completed full-tenant export receipt is required before closure';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM tenant_deletion_schedules schedule
      WHERE schedule.tenant_id = NEW.id
        AND schedule.state IN ('scheduled','blocked-by-hold','executing','completed')
    ) THEN
      RAISE EXCEPTION 'A deletion schedule is required before closure';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_close_evidence_guard ON tenants;
CREATE TRIGGER tenant_close_evidence_guard
BEFORE UPDATE OF status ON tenants
FOR EACH ROW EXECUTE FUNCTION app.enforce_tenant_close_evidence();

CREATE OR REPLACE FUNCTION app.enforce_support_elevation_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE approval support_case_approvals%ROWTYPE;
DECLARE support_case support_cases%ROWTYPE;
BEGIN
  SELECT * INTO approval FROM support_case_approvals WHERE id = NEW.approval_id;
  IF NOT FOUND OR approval.support_case_id <> NEW.support_case_id OR approval.decision <> 'approved' THEN
    RAISE EXCEPTION 'An approved customer approval is required for support elevation';
  END IF;
  IF approval.expires_at <= now() OR NEW.expires_at > approval.expires_at THEN
    RAISE EXCEPTION 'Support elevation cannot exceed customer approval validity';
  END IF;
  IF NOT NEW.granted_scope <@ approval.approved_scope THEN
    RAISE EXCEPTION 'Support elevation scope exceeds customer approval';
  END IF;
  SELECT * INTO support_case FROM support_cases WHERE id = NEW.support_case_id;
  IF NOT FOUND OR support_case.tenant_id <> NEW.tenant_id OR support_case.state NOT IN ('approved','active') THEN
    RAISE EXCEPTION 'Support case is not eligible for elevation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_elevation_approval_guard ON support_elevation_sessions;
CREATE TRIGGER support_elevation_approval_guard
BEFORE INSERT OR UPDATE OF approval_id, granted_scope, expires_at ON support_elevation_sessions
FOR EACH ROW EXECUTE FUNCTION app.enforce_support_elevation_approval();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_operational_profiles','tenant_lifecycle_events','tenant_export_receipts',
    'tenant_retention_holds','tenant_deletion_schedules','tenant_usage_snapshots',
    'tenant_usage_thresholds','tenant_billing_links','tenant_entitlement_overrides',
    'tenant_entitlement_history','entitlement_denial_diagnostics','support_cases',
    'support_case_approvals','support_elevation_sessions','support_session_events',
    'platform_security_incidents'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, veza_app, veza_worker', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO veza_control', table_name);
  END LOOP;
END
$$;

REVOKE UPDATE, DELETE ON tenant_lifecycle_events, tenant_entitlement_history, support_session_events FROM veza_control;
GRANT EXECUTE ON FUNCTION app.enforce_tenant_close_evidence() TO veza_control;
GRANT EXECUTE ON FUNCTION app.enforce_support_elevation_approval() TO veza_control;

COMMIT;
