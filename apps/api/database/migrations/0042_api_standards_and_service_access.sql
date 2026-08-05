BEGIN;

CREATE TABLE service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  principal_user_id uuid NOT NULL REFERENCES users(id),
  client_id text NOT NULL CHECK (client_id ~ '^vz_[A-Za-z0-9]{24,80}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 160),
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0),
  allowed_ip_cidrs cidr[] NOT NULL DEFAULT ARRAY[]::cidr[],
  token_ttl_seconds integer NOT NULL DEFAULT 900 CHECK (token_ttl_seconds BETWEEN 60 AND 3600),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (client_id),
  UNIQUE (tenant_id, principal_user_id)
);

CREATE TABLE service_account_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_account_id uuid NOT NULL REFERENCES service_accounts(id) ON DELETE CASCADE,
  secret_prefix text NOT NULL CHECK (secret_prefix ~ '^vzs_[A-Za-z0-9]{6}$'),
  secret_salt text NOT NULL,
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired','compromised')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  retired_at timestamptz,
  UNIQUE (service_account_id, secret_prefix)
);
CREATE UNIQUE INDEX service_account_one_active_secret_idx
  ON service_account_secrets(service_account_id)
  WHERE status = 'active';

CREATE TABLE api_quota_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('tenant','service-account','user')),
  subject_id uuid,
  route_pattern text NOT NULL CHECK (length(route_pattern) BETWEEN 1 AND 300),
  method text NOT NULL CHECK (method IN ('*','GET','POST','PUT','PATCH','DELETE')),
  request_limit integer NOT NULL CHECK (request_limit BETWEEN 1 AND 1000000),
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  burst_limit integer CHECK (burst_limit IS NULL OR burst_limit >= request_limit),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject_type, subject_id, route_pattern, method)
);

CREATE TABLE api_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 3 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid NOT NULL REFERENCES users(id),
  state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing','completed','failed')),
  response_status integer,
  response_headers jsonb,
  response_body jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, operation_key, idempotency_key)
);
CREATE INDEX api_idempotency_expiry_idx ON api_idempotency_records(expires_at);

CREATE TABLE api_deprecation_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_pattern text NOT NULL,
  method text NOT NULL CHECK (method IN ('*','GET','POST','PUT','PATCH','DELETE')),
  deprecated_at timestamptz NOT NULL,
  sunset_at timestamptz,
  successor_url text,
  documentation_url text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  UNIQUE (route_pattern, method, status),
  CHECK (sunset_at IS NULL OR sunset_at > deprecated_at)
);

CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint_url text NOT NULL CHECK (endpoint_url ~ '^https://'),
  secret_reference text NOT NULL CHECK (length(secret_reference) BETWEEN 3 AND 512),
  event_patterns text[] NOT NULL CHECK (cardinality(event_patterns) > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  maximum_attempts integer NOT NULL DEFAULT 12 CHECK (maximum_attempts BETWEEN 1 AND 100),
  timeout_ms integer NOT NULL DEFAULT 10000 CHECK (timeout_ms BETWEEN 1000 AND 30000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, endpoint_url)
);

CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_endpoint_id uuid NOT NULL,
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  replay_sequence integer NOT NULL DEFAULT 0 CHECK (replay_sequence >= 0),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','retry','delivered','failed','dead-letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  lease_owner text,
  response_status integer,
  response_checksum text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (tenant_id, webhook_endpoint_id, outbox_event_id, replay_sequence),
  FOREIGN KEY (tenant_id, webhook_endpoint_id) REFERENCES webhook_endpoints(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX webhook_deliveries_claimable_idx
  ON webhook_deliveries(next_attempt_at, created_at, id)
  WHERE state IN ('pending','retry');

CREATE TABLE webhook_replay_nonces (
  nonce text PRIMARY KEY CHECK (length(nonce) BETWEEN 16 AND 200),
  endpoint_key text NOT NULL,
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > received_at)
);
CREATE INDEX webhook_replay_nonces_expiry_idx ON webhook_replay_nonces(expires_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'service_accounts','api_quota_policies','api_idempotency_records',
    'webhook_endpoints','webhook_deliveries'
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

GRANT SELECT, INSERT, UPDATE ON service_account_secrets TO veza_app;
GRANT SELECT ON service_account_secrets TO veza_control;
GRANT SELECT ON api_deprecation_registry TO veza_app, veza_control;
GRANT SELECT, INSERT, UPDATE ON webhook_replay_nonces TO veza_app, veza_worker;

CREATE OR REPLACE FUNCTION app.cleanup_api_runtime_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE idempotency_deleted integer;
DECLARE nonce_deleted integer;
BEGIN
  DELETE FROM api_idempotency_records WHERE expires_at <= now();
  GET DIAGNOSTICS idempotency_deleted = ROW_COUNT;
  DELETE FROM webhook_replay_nonces WHERE expires_at <= now();
  GET DIAGNOSTICS nonce_deleted = ROW_COUNT;
  RETURN jsonb_build_object(
    'idempotencyDeleted',idempotency_deleted,
    'nonceDeleted',nonce_deleted
  );
END
$$;
REVOKE ALL ON FUNCTION app.cleanup_api_runtime_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.cleanup_api_runtime_records() TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,'api.runtime-cleanup','api.runtime-cleanup','{}'::jsonb,
  3600,now(),'active',NULL
)
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET status = 'active', updated_at = now();

COMMIT;
