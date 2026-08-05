BEGIN;

INSERT INTO event_consumer_definitions (
  consumer_key, display_name, handler_key, destination_type,
  maximum_attempts, lease_seconds, status, created_by
) VALUES (
  'api.webhook-router',
  'Outbound webhook router',
  'api.webhook-router',
  'webhook',
  12,
  90,
  'active',
  NULL
)
ON CONFLICT (consumer_key) DO UPDATE
SET handler_key = EXCLUDED.handler_key,
    destination_type = EXCLUDED.destination_type,
    maximum_attempts = EXCLUDED.maximum_attempts,
    lease_seconds = EXCLUDED.lease_seconds,
    status = 'active',
    updated_at = now();

INSERT INTO event_consumer_subscriptions (
  consumer_key, event_pattern, minimum_major_version, maximum_major_version
) VALUES ('api.webhook-router','*',1,99)
ON CONFLICT (consumer_key, event_pattern) DO UPDATE
SET minimum_major_version = EXCLUDED.minimum_major_version,
    maximum_major_version = EXCLUDED.maximum_major_version;

ALTER TABLE webhook_deliveries
  ADD COLUMN request_timestamp bigint,
  ADD COLUMN request_nonce text,
  ADD COLUMN signature_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN response_excerpt text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION app.webhook_pattern_matches(
  p_pattern text,
  p_event_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_event_name ~ (
    '^' || regexp_replace(
      regexp_replace(p_pattern, '([.\\+?^$(){}|\[\]])', '\\\1', 'g'),
      '\*', '.*', 'g'
    ) || '$'
  )
$$;

CREATE OR REPLACE FUNCTION app.reconcile_webhook_delivery_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE changed integer;
BEGIN
  UPDATE webhook_deliveries
  SET state = 'retry',
      next_attempt_at = now(),
      leased_at = NULL,
      lease_owner = NULL,
      last_error = COALESCE(last_error,'stale-webhook-lease-recovered'),
      updated_at = now()
  WHERE state = 'processing'
    AND leased_at < now() - interval '5 minutes';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

REVOKE ALL ON FUNCTION app.webhook_pattern_matches(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reconcile_webhook_delivery_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.webhook_pattern_matches(text,text) TO veza_app, veza_worker;
GRANT EXECUTE ON FUNCTION app.reconcile_webhook_delivery_state() TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,'api.webhook-reconciliation','api.webhook-reconciliation','{}'::jsonb,
  60,now(),'active',NULL
)
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET status = 'active', updated_at = now();

COMMIT;
