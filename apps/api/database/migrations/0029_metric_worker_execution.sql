BEGIN;

GRANT SELECT ON metric_refresh_runs TO veza_control;

CREATE OR REPLACE FUNCTION app.refresh_due_core_metrics(p_worker_id text,p_limit integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE target record;
DECLARE run_id uuid;
DECLARE refreshed integer := 0;
BEGIN
  IF length(btrim(p_worker_id)) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'worker identifier is invalid';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'refresh target limit is invalid';
  END IF;

  FOR target IN
    SELECT i.tenant_id,i.id institution_id
    FROM institutions i
    LEFT JOIN LATERAL (
      SELECT max(s.measured_at) measured_at
      FROM metric_snapshots s
      WHERE s.tenant_id=i.tenant_id AND s.institution_id=i.id
    ) latest ON true
    WHERE i.status='active'
      AND (latest.measured_at IS NULL OR latest.measured_at < now()-interval '15 minutes')
    ORDER BY latest.measured_at NULLS FIRST,i.created_at
    LIMIT p_limit
    FOR UPDATE OF i SKIP LOCKED
  LOOP
    run_id:=gen_random_uuid();
    INSERT INTO metric_refresh_runs(id,tenant_id,institution_id,status,worker_id)
    VALUES(run_id,target.tenant_id,target.institution_id,'running',p_worker_id);
    BEGIN
      PERFORM set_config('app.tenant_id',target.tenant_id::text,true);
      PERFORM app.refresh_core_metrics(target.tenant_id,target.institution_id);
      UPDATE metric_refresh_runs SET status='completed',completed_at=now(),metric_count=5
      WHERE id=run_id;
      refreshed:=refreshed+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE metric_refresh_runs SET status='failed',completed_at=now(),error_message=left(SQLERRM,1000)
      WHERE id=run_id;
    END;
  END LOOP;
  RETURN refreshed;
END $$;

REVOKE ALL ON FUNCTION app.refresh_due_core_metrics(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_due_core_metrics(text,integer) TO veza_worker;

COMMIT;
