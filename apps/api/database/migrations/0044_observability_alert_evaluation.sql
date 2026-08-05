BEGIN;

CREATE OR REPLACE FUNCTION app.upsert_platform_heartbeat(
  p_runtime_key text,
  p_runtime_type text,
  p_environment text,
  p_release_version text,
  p_instance_id text,
  p_status text,
  p_capabilities text[],
  p_metadata jsonb
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  INSERT INTO platform_runtime_heartbeats (
    runtime_key, runtime_type, environment, release_version,
    instance_id, status, capabilities, metadata,
    started_at, last_seen_at
  ) VALUES (
    p_runtime_key, p_runtime_type, p_environment, p_release_version,
    p_instance_id, p_status, p_capabilities, p_metadata,
    now(), now()
  )
  ON CONFLICT (runtime_key)
  DO UPDATE SET runtime_type = EXCLUDED.runtime_type,
                environment = EXCLUDED.environment,
                release_version = EXCLUDED.release_version,
                instance_id = EXCLUDED.instance_id,
                status = EXCLUDED.status,
                capabilities = EXCLUDED.capabilities,
                metadata = EXCLUDED.metadata,
                last_seen_at = now(),
                updated_at = now()
$$;

CREATE OR REPLACE FUNCTION app.evaluate_platform_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  rule_record record;
  should_fire boolean;
  evidence_value jsonb;
  fingerprint_value text;
  changed integer := 0;
  metric_value numeric;
BEGIN
  FOR rule_record IN SELECT * FROM alert_rules WHERE status = 'active' LOOP
    should_fire := false;
    evidence_value := '{}'::jsonb;

    IF rule_record.alert_key = 'outbox.backlog-high' THEN
      SELECT count(*) INTO metric_value
      FROM outbox_events
      WHERE published_at IS NULL AND dead_lettered_at IS NULL;
      should_fire := metric_value > COALESCE((rule_record.condition->>'greaterThan')::numeric,1000);
      evidence_value := jsonb_build_object('backlog',metric_value);
    ELSIF rule_record.alert_key = 'events.dead-letter' THEN
      SELECT count(*) INTO metric_value
      FROM outbox_events WHERE dead_lettered_at IS NOT NULL;
      should_fire := metric_value > 0;
      evidence_value := jsonb_build_object('deadLetters',metric_value);
    ELSIF rule_record.alert_key = 'worker.heartbeat-missing' THEN
      SELECT EXTRACT(EPOCH FROM (now()-max(last_seen_at))) INTO metric_value
      FROM platform_runtime_heartbeats WHERE runtime_type = 'worker';
      should_fire := metric_value IS NULL OR metric_value > COALESCE((rule_record.condition->>'seconds')::numeric,120);
      evidence_value := jsonb_build_object('heartbeatAgeSeconds',metric_value);
    ELSIF rule_record.alert_key = 'slo.fast-burn' THEN
      SELECT COALESCE(max(GREATEST(COALESCE(burn_rate_1h,0),COALESCE(burn_rate_6h,0))),0)
      INTO metric_value
      FROM slo_measurements
      WHERE measured_at >= now() - interval '6 hours';
      should_fire := metric_value >= LEAST(
        COALESCE((rule_record.condition->>'oneHour')::numeric,14.4),
        COALESCE((rule_record.condition->>'sixHour')::numeric,6)
      );
      evidence_value := jsonb_build_object('maximumBurnRate',metric_value);
    ELSE
      CONTINUE;
    END IF;

    fingerprint_value := encode(
      digest(rule_record.alert_key || ':' || coalesce(evidence_value::text,''),'sha256'),
      'hex'
    );

    IF should_fire THEN
      INSERT INTO alert_events (
        alert_rule_id, state, summary, evidence, fingerprint
      ) VALUES (
        rule_record.id,
        'firing',
        rule_record.display_name || ' requires attention.',
        evidence_value,
        fingerprint_value
      ) ON CONFLICT (alert_rule_id, fingerprint, state) DO NOTHING;
      changed := changed + 1;
    ELSE
      UPDATE alert_events
      SET state = 'resolved', resolved_at = now()
      WHERE alert_rule_id = rule_record.id AND state IN ('firing','acknowledged');
      changed := changed + 1;
    END IF;
  END LOOP;
  RETURN changed;
END
$$;

REVOKE ALL ON FUNCTION app.upsert_platform_heartbeat(
  text,text,text,text,text,text,text[],jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.evaluate_platform_alerts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.upsert_platform_heartbeat(
  text,text,text,text,text,text,text[],jsonb
) TO veza_app, veza_worker;
GRANT EXECUTE ON FUNCTION app.evaluate_platform_alerts() TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,'observability.alert-evaluation','observability.alert-evaluation','{}'::jsonb,
  60,now(),'active',NULL
)
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET status = 'active', updated_at = now();

COMMIT;
