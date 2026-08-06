BEGIN;

UPDATE scheduled_jobs
SET created_source = CASE WHEN created_by IS NULL THEN 'system' ELSE 'user' END
WHERE created_source = 'legacy';

ALTER TABLE scheduled_jobs
  ALTER COLUMN created_source SET DEFAULT 'user',
  ADD CONSTRAINT scheduled_jobs_creator_evidence_check CHECK (
    (created_source = 'system' AND created_by IS NULL)
    OR (created_source = 'user' AND created_by IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION app.ensure_platform_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  global_changed integer := 0;
  tenant_changed integer := 0;
BEGIN
  INSERT INTO scheduled_jobs (
    tenant_id, job_key, handler_key, payload, interval_seconds,
    next_run_at, status, created_by, created_source
  ) VALUES
    (NULL,'communications.digest-preparation','communications.digest-preparation','{}'::jsonb,60,now(),'active',NULL,'system'),
    (NULL,'support.session-expiry','support.session-expiry','{}'::jsonb,300,now(),'active',NULL,'system'),
    (NULL,'commercial.effective-date-sweep','commercial.effective-date-sweep','{}'::jsonb,300,now(),'active',NULL,'system'),
    (NULL,'media.retention-reconciliation','media.retention-reconciliation','{"batchSize":100}'::jsonb,3600,now(),'active',NULL,'system'),
    (NULL,'observability.slo-measurement','observability.slo-measurement','{}'::jsonb,300,now(),'active',NULL,'system'),
    (NULL,'observability.alert-evaluation','observability.alert-evaluation','{}'::jsonb,60,now(),'active',NULL,'system'),
    (NULL,'api.runtime-cleanup','api.runtime-cleanup','{}'::jsonb,3600,now(),'active',NULL,'system'),
    (NULL,'api.webhook-reconciliation','api.webhook-reconciliation','{}'::jsonb,60,now(),'active',NULL,'system'),
    (NULL,'exports.expiry','exports.expiry','{}'::jsonb,3600,now(),'active',NULL,'system')
  ON CONFLICT (tenant_id, job_key) DO UPDATE
  SET handler_key = EXCLUDED.handler_key,
      payload = EXCLUDED.payload,
      interval_seconds = EXCLUDED.interval_seconds,
      status = 'active',
      created_source = 'system',
      created_by = NULL,
      updated_at = now();
  GET DIAGNOSTICS global_changed = ROW_COUNT;

  INSERT INTO scheduled_jobs (
    tenant_id, job_key, handler_key, payload, interval_seconds,
    next_run_at, status, created_by, created_source
  )
  SELECT tenant.id,
         'search.projection-reconciliation',
         'search.projection-reconciliation',
         jsonb_build_object('tenantId',tenant.id),
         300,
         now(),
         'active',
         tenant.created_by,
         'user'
  FROM tenants tenant
  WHERE tenant.status = 'active'
  ON CONFLICT (tenant_id, job_key) DO UPDATE
  SET handler_key = EXCLUDED.handler_key,
      payload = EXCLUDED.payload,
      interval_seconds = EXCLUDED.interval_seconds,
      status = 'active',
      created_by = EXCLUDED.created_by,
      created_source = 'user',
      updated_at = now();
  GET DIAGNOSTICS tenant_changed = ROW_COUNT;

  RETURN jsonb_build_object(
    'globalSchedules',global_changed,
    'tenantSchedules',tenant_changed
  );
END
$$;

REVOKE ALL ON FUNCTION app.ensure_platform_schedules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ensure_platform_schedules() TO veza_worker;

SELECT app.ensure_platform_schedules();

COMMIT;
