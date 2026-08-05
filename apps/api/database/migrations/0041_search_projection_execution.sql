BEGIN;

INSERT INTO event_consumer_definitions (
  consumer_key, display_name, handler_key, destination_type,
  maximum_attempts, lease_seconds, status, created_by
) VALUES (
  'search.projection-events',
  'Search projection events',
  'search.projection-events',
  'search',
  8,
  120,
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
) VALUES
  ('search.projection-events','people.*',1,99),
  ('search.projection-events','catalogue.*',1,99),
  ('search.projection-events','curriculum.*',1,99),
  ('search.projection-events','studio.*',1,99),
  ('search.projection-events','storage.*',1,99)
ON CONFLICT (consumer_key, event_pattern) DO UPDATE
SET minimum_major_version = EXCLUDED.minimum_major_version,
    maximum_major_version = EXCLUDED.maximum_major_version;

CREATE OR REPLACE FUNCTION app.ensure_tenant_platform_schedules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO scheduled_jobs (
      tenant_id, job_key, handler_key, payload, interval_seconds,
      next_run_at, status, created_by
    ) VALUES (
      NEW.id,
      'search.projection-reconciliation',
      'search.projection-reconciliation',
      jsonb_build_object('tenantId',NEW.id),
      300,
      now(),
      'active',
      NEW.created_by
    )
    ON CONFLICT (tenant_id, job_key) DO UPDATE
    SET status = 'active', updated_at = now();
  ELSE
    UPDATE scheduled_jobs
    SET status = 'paused', version = version + 1, updated_at = now()
    WHERE tenant_id = NEW.id AND job_key = 'search.projection-reconciliation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER tenants_platform_schedules
AFTER INSERT OR UPDATE OF status ON tenants
FOR EACH ROW EXECUTE FUNCTION app.ensure_tenant_platform_schedules();

COMMIT;
