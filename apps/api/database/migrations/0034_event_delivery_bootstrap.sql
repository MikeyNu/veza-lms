BEGIN;

ALTER TABLE event_consumer_definitions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE scheduled_jobs ALTER COLUMN created_by DROP NOT NULL;

CREATE OR REPLACE FUNCTION app.event_pattern_matches(p_pattern text, p_event_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_event_name LIKE replace(p_pattern, '*', '%')
$$;

INSERT INTO event_consumer_definitions (
  consumer_key, display_name, handler_key, destination_type, status, created_by
) VALUES (
  'platform.delivery-evidence',
  'Platform delivery evidence',
  'platform.delivery-evidence',
  'internal',
  'active',
  NULL
)
ON CONFLICT (consumer_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    handler_key = EXCLUDED.handler_key,
    destination_type = EXCLUDED.destination_type,
    status = 'active',
    updated_at = now();

INSERT INTO event_consumer_subscriptions (
  consumer_key, event_pattern, minimum_major_version, maximum_major_version
) VALUES ('platform.delivery-evidence', '*', 1, 99)
ON CONFLICT (consumer_key, event_pattern) DO UPDATE
SET minimum_major_version = EXCLUDED.minimum_major_version,
    maximum_major_version = EXCLUDED.maximum_major_version;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,
  'platform.event-reconciliation',
  'platform.event-reconciliation',
  '{}'::jsonb,
  300,
  now(),
  'active',
  NULL
)
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET handler_key = EXCLUDED.handler_key,
    payload = EXCLUDED.payload,
    interval_seconds = EXCLUDED.interval_seconds,
    status = 'active',
    updated_at = now();

COMMIT;
