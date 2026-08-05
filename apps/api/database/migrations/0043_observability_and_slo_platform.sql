BEGIN;

CREATE TABLE platform_runtime_heartbeats (
  runtime_key text PRIMARY KEY CHECK (runtime_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  runtime_type text NOT NULL CHECK (runtime_type IN ('api','web','control-plane','worker','migration')),
  environment text NOT NULL,
  release_version text NOT NULL,
  instance_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('starting','ready','degraded','stopping')),
  capabilities text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON platform_runtime_heartbeats TO veza_app, veza_worker;
GRANT SELECT ON platform_runtime_heartbeats TO veza_control;

CREATE TABLE request_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  route_template text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  request_bytes bigint NOT NULL DEFAULT 0 CHECK (request_bytes >= 0),
  response_bytes bigint NOT NULL DEFAULT 0 CHECK (response_bytes >= 0),
  correlation_id text NOT NULL,
  trace_id text,
  error_code text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_observations_time_idx ON request_observations(occurred_at DESC);
CREATE INDEX request_observations_tenant_time_idx ON request_observations(tenant_id, occurred_at DESC);
GRANT INSERT ON request_observations TO veza_app;
GRANT SELECT ON request_observations TO veza_control;

CREATE TABLE security_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  observation_type text NOT NULL
    CHECK (observation_type IN ('authentication-failure','authorization-denial','rls-denial','webhook-signature-failure','quota-denial')),
  route_template text,
  reason_code text NOT NULL,
  source_hash text CHECK (source_hash IS NULL OR source_hash ~ '^[a-f0-9]{64}$'),
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_observations_time_idx ON security_observations(observation_type, occurred_at DESC);
GRANT INSERT ON security_observations TO veza_app;
GRANT SELECT ON security_observations TO veza_control;

CREATE TABLE platform_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  environment text NOT NULL,
  release_version text NOT NULL,
  error_class text NOT NULL,
  error_fingerprint text NOT NULL CHECK (error_fingerprint ~ '^[a-f0-9]{64}$'),
  message_summary text NOT NULL CHECK (length(message_summary) BETWEEN 1 AND 1000),
  route_template text,
  correlation_id text,
  trace_id text,
  occurrence_count bigint NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','resolved','ignored')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (service_name, environment, release_version, error_fingerprint, state)
);
GRANT INSERT, UPDATE ON platform_error_reports TO veza_app, veza_worker;
GRANT SELECT, UPDATE ON platform_error_reports TO veza_control;

CREATE TABLE slo_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  slo_key text NOT NULL CHECK (slo_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  display_name text NOT NULL,
  indicator_type text NOT NULL CHECK (indicator_type IN ('availability','latency','freshness','delivery')),
  objective numeric(8,6) NOT NULL CHECK (objective > 0 AND objective <= 1),
  window_days integer NOT NULL CHECK (window_days BETWEEN 1 AND 90),
  latency_threshold_ms integer,
  query_definition jsonb NOT NULL CHECK (jsonb_typeof(query_definition) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_name, slo_key)
);

CREATE TABLE slo_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_definition_id uuid NOT NULL REFERENCES slo_definitions(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_ended_at timestamptz NOT NULL,
  total_events bigint NOT NULL CHECK (total_events >= 0),
  good_events bigint NOT NULL CHECK (good_events >= 0),
  achieved numeric(12,8) NOT NULL CHECK (achieved >= 0 AND achieved <= 1),
  error_budget_remaining numeric(12,8) NOT NULL,
  burn_rate_1h numeric(18,8),
  burn_rate_6h numeric(18,8),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  UNIQUE (slo_definition_id, measured_at),
  CHECK (window_ended_at >= window_started_at),
  CHECK (good_events <= total_events)
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL CHECK (alert_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  display_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  condition_type text NOT NULL CHECK (condition_type IN ('threshold','absence','burn-rate','dependency')),
  condition jsonb NOT NULL CHECK (jsonb_typeof(condition) = 'object'),
  notification_topic text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_key)
);

CREATE TABLE alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('firing','acknowledged','resolved')),
  summary text NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  fired_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  UNIQUE (alert_rule_id, fingerprint, state)
);

GRANT SELECT ON slo_definitions, slo_measurements, alert_rules, alert_events TO veza_control;
GRANT SELECT, INSERT, UPDATE ON slo_measurements, alert_events TO veza_worker;

INSERT INTO slo_definitions (
  service_name, slo_key, display_name, indicator_type,
  objective, window_days, latency_threshold_ms, query_definition
) VALUES
  ('veza-api','availability','API availability','availability',0.999,30,NULL,'{"source":"request_observations","goodStatusBelow":500}'::jsonb),
  ('veza-api','latency','API interactive latency','latency',0.99,30,750,'{"source":"request_observations","routes":"tenant"}'::jsonb),
  ('veza-worker','outbox-delivery','Domain event delivery','delivery',0.999,30,NULL,'{"source":"event_delivery_evidence","terminal":"delivered"}'::jsonb),
  ('veza-worker','notification-delivery','Required notification delivery','delivery',0.99,30,NULL,'{"source":"notification_deliveries","requiredOnly":true}'::jsonb),
  ('veza-worker','search-freshness','Search projection freshness','freshness',0.99,30,NULL,'{"source":"search_reconciliation_runs","maximumLagSeconds":600}'::jsonb)
ON CONFLICT (service_name, slo_key) DO NOTHING;

INSERT INTO alert_rules (
  alert_key, display_name, severity, condition_type, condition, notification_topic
) VALUES
  ('api.readiness-failed','API readiness failed','critical','dependency','{"consecutiveFailures":3}'::jsonb,'platform.operations'),
  ('outbox.backlog-high','Outbox backlog high','warning','threshold','{"metric":"outbox_backlog","greaterThan":1000,"forSeconds":300}'::jsonb,'platform.operations'),
  ('events.dead-letter','Event dead letter detected','critical','threshold','{"metric":"event_dead_letters","greaterThan":0}'::jsonb,'platform.operations'),
  ('worker.heartbeat-missing','Worker heartbeat missing','critical','absence','{"runtimeType":"worker","seconds":120}'::jsonb,'platform.operations'),
  ('slo.fast-burn','SLO error budget fast burn','critical','burn-rate','{"oneHour":14.4,"sixHour":6}'::jsonb,'platform.operations')
ON CONFLICT (alert_key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.measure_platform_slos()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE definition record;
DECLARE total_count bigint;
DECLARE good_count bigint;
DECLARE achieved_value numeric;
DECLARE inserted integer := 0;
BEGIN
  FOR definition IN SELECT * FROM slo_definitions WHERE status = 'active' LOOP
    IF definition.slo_key = 'availability' THEN
      SELECT count(*), count(*) FILTER (WHERE status_code < 500)
      INTO total_count, good_count
      FROM request_observations
      WHERE service_name = definition.service_name
        AND occurred_at >= now() - (definition.window_days * interval '1 day');
    ELSIF definition.slo_key = 'latency' THEN
      SELECT count(*), count(*) FILTER (WHERE latency_ms <= definition.latency_threshold_ms)
      INTO total_count, good_count
      FROM request_observations
      WHERE service_name = definition.service_name
        AND occurred_at >= now() - (definition.window_days * interval '1 day');
    ELSIF definition.slo_key = 'outbox-delivery' THEN
      SELECT count(*), count(*) FILTER (WHERE state = 'delivered')
      INTO total_count, good_count
      FROM event_delivery_evidence
      WHERE recorded_at >= now() - (definition.window_days * interval '1 day')
        AND delivery_stage = 'transport';
    ELSIF definition.slo_key = 'notification-delivery' THEN
      SELECT count(*), count(*) FILTER (WHERE delivery.state IN ('sent','delivered'))
      INTO total_count, good_count
      FROM notification_deliveries delivery
      JOIN notification_intents intent ON intent.id = delivery.notification_intent_id
      WHERE delivery.created_at >= now() - (definition.window_days * interval '1 day')
        AND intent.policy = 'required';
    ELSE
      SELECT count(*), count(*) FILTER (
        WHERE state = 'completed' AND completed_at <= started_at + interval '10 minutes'
      )
      INTO total_count, good_count
      FROM search_reconciliation_runs
      WHERE started_at >= now() - (definition.window_days * interval '1 day');
    END IF;

    achieved_value := CASE WHEN total_count = 0 THEN 1 ELSE good_count::numeric / total_count END;
    INSERT INTO slo_measurements (
      slo_definition_id, measured_at, window_started_at, window_ended_at,
      total_events, good_events, achieved, error_budget_remaining, evidence
    ) VALUES (
      definition.id, date_trunc('minute',now()),
      now() - (definition.window_days * interval '1 day'), now(),
      total_count, good_count, achieved_value,
      CASE
        WHEN definition.objective = 1 THEN 0
        ELSE 1 - ((1 - achieved_value) / (1 - definition.objective))
      END,
      jsonb_build_object('objective',definition.objective)
    ) ON CONFLICT DO NOTHING;
    inserted := inserted + 1;
  END LOOP;
  RETURN inserted;
END
$$;
REVOKE ALL ON FUNCTION app.measure_platform_slos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.measure_platform_slos() TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,'observability.slo-measurement','observability.slo-measurement','{}'::jsonb,
  300,now(),'active',NULL
)
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET status = 'active', updated_at = now();

COMMIT;
