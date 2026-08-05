BEGIN;

CREATE TABLE event_schema_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name ~ '^[a-z][a-z0-9.-]{2,159}$'),
  major_version integer NOT NULL CHECK (major_version > 0),
  minor_version integer NOT NULL DEFAULT 0 CHECK (minor_version >= 0),
  owner_context text NOT NULL CHECK (owner_context ~ '^[a-z][a-z0-9-]{1,79}$'),
  classification text NOT NULL DEFAULT 'internal'
    CHECK (classification IN ('public','internal','confidential','restricted')),
  compatibility text NOT NULL DEFAULT 'additive'
    CHECK (compatibility IN ('additive','backward','strict')),
  payload_schema jsonb NOT NULL CHECK (jsonb_typeof(payload_schema) = 'object'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','deprecated','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  submitted_by uuid REFERENCES users(id),
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_name, major_version, minor_version),
  CHECK ((submitted_by IS NULL) = (submitted_at IS NULL)),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (approval_reason IS NULL OR length(btrim(approval_reason)) BETWEEN 10 AND 1000)
);
CREATE UNIQUE INDEX event_schema_one_active_major_idx
  ON event_schema_registry(event_name, major_version)
  WHERE status = 'active';

CREATE TABLE event_consumer_definitions (
  consumer_key text PRIMARY KEY CHECK (consumer_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 160),
  handler_key text NOT NULL CHECK (handler_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  destination_type text NOT NULL
    CHECK (destination_type IN ('internal','sqs','webhook','search','notification','media')),
  maximum_attempts integer NOT NULL DEFAULT 12 CHECK (maximum_attempts BETWEEN 1 AND 100),
  lease_seconds integer NOT NULL DEFAULT 60 CHECK (lease_seconds BETWEEN 10 AND 3600),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active','paused','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_consumer_subscriptions (
  consumer_key text NOT NULL REFERENCES event_consumer_definitions(consumer_key) ON DELETE CASCADE,
  event_pattern text NOT NULL CHECK (event_pattern ~ '^[a-z*][a-z0-9.*-]{0,159}$'),
  minimum_major_version integer NOT NULL DEFAULT 1 CHECK (minimum_major_version > 0),
  maximum_major_version integer NOT NULL DEFAULT 1 CHECK (maximum_major_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_key, event_pattern),
  CHECK (maximum_major_version >= minimum_major_version)
);

CREATE TABLE event_consumer_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  consumer_key text NOT NULL REFERENCES event_consumer_definitions(consumer_key),
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  replay_sequence integer NOT NULL DEFAULT 0 CHECK (replay_sequence >= 0),
  event_name text NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','retry','completed','dead-letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  lease_owner text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  handler_version text,
  result_checksum text CHECK (result_checksum IS NULL OR result_checksum ~ '^[a-f0-9]{64}$'),
  last_error text,
  UNIQUE (consumer_key, outbox_event_id, replay_sequence)
);
CREATE INDEX event_consumer_inbox_claimable_idx
  ON event_consumer_inbox(next_attempt_at, first_seen_at, id)
  WHERE state IN ('pending','retry');
CREATE INDEX event_consumer_inbox_lag_idx
  ON event_consumer_inbox(consumer_key, state, first_seen_at);

CREATE TABLE event_delivery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  delivery_stage text NOT NULL
    CHECK (delivery_stage IN ('transport','consumer','replay','reconciliation')),
  destination_key text NOT NULL CHECK (length(destination_key) BETWEEN 2 AND 160),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  state text NOT NULL CHECK (state IN ('started','delivered','retry','failed','dead-letter')),
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 3 AND 160),
  provider_reference text,
  error_code text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_delivery_evidence_event_idx
  ON event_delivery_evidence(outbox_event_id, recorded_at DESC);
CREATE INDEX event_delivery_evidence_destination_idx
  ON event_delivery_evidence(destination_key, recorded_at DESC);

CREATE TABLE event_replay_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE RESTRICT,
  consumer_key text REFERENCES event_consumer_definitions(consumer_key),
  requested_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','completed','failed','cancelled')),
  replay_sequence integer,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_code text,
  UNIQUE (outbox_event_id, consumer_key, requested_at)
);

CREATE TABLE scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  job_key text NOT NULL CHECK (job_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  handler_key text NOT NULL CHECK (handler_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  interval_seconds integer CHECK (interval_seconds IS NULL OR interval_seconds BETWEEN 60 AND 2592000),
  next_run_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  maximum_attempts integer NOT NULL DEFAULT 8 CHECK (maximum_attempts BETWEEN 1 AND 100),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, job_key)
);
CREATE INDEX scheduled_jobs_due_idx ON scheduled_jobs(next_run_at, id) WHERE status = 'active';

CREATE TABLE scheduled_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_job_id uuid NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing','completed','retry','failed','dead-letter')),
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 3 AND 160),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  next_attempt_at timestamptz,
  result jsonb,
  last_error text,
  UNIQUE (scheduled_job_id, scheduled_for, attempt_number)
);

CREATE TABLE event_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 3 AND 160),
  state text NOT NULL CHECK (state IN ('processing','completed','failed')),
  backlog_count bigint NOT NULL DEFAULT 0,
  dead_letter_count bigint NOT NULL DEFAULT 0,
  consumer_lag_count bigint NOT NULL DEFAULT 0,
  oldest_backlog_at timestamptz,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);

ALTER TABLE event_consumer_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_consumer_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY event_consumer_inbox_tenant_isolation ON event_consumer_inbox
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
ALTER TABLE event_delivery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_delivery_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY event_delivery_evidence_tenant_isolation ON event_delivery_evidence
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE OR REPLACE FUNCTION app.event_pattern_matches(p_pattern text, p_event_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_event_name LIKE replace(replace(p_pattern, '%', '\\%'), '*', '%') ESCAPE '\\'
$$;

CREATE OR REPLACE FUNCTION app.enqueue_event_consumers(p_outbox_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO event_consumer_inbox (
    tenant_id, consumer_key, outbox_event_id, replay_sequence,
    event_name, event_version, envelope, payload_checksum
  )
  SELECT event.tenant_id,
         subscription.consumer_key,
         event.id,
         0,
         event.event_name,
         event.event_version,
         jsonb_build_object(
           'schemaVersion', 1,
           'eventId', event.id,
           'tenantId', event.tenant_id,
           'eventName', event.event_name,
           'eventVersion', event.event_version,
           'aggregate', jsonb_build_object(
             'type', event.aggregate_type,
             'id', event.aggregate_id,
             'version', event.aggregate_version
           ),
           'actorId', event.actor_id,
           'correlationId', event.correlation_id,
           'occurredAt', event.occurred_at,
           'payload', event.payload
         ),
         encode(digest(event.payload::text, 'sha256'), 'hex')
  FROM outbox_events event
  JOIN event_consumer_subscriptions subscription
    ON app.event_pattern_matches(subscription.event_pattern, event.event_name)
   AND event.event_version BETWEEN subscription.minimum_major_version AND subscription.maximum_major_version
  JOIN event_consumer_definitions consumer
    ON consumer.consumer_key = subscription.consumer_key
   AND consumer.status = 'active'
  WHERE event.id = p_outbox_event_id
  ON CONFLICT (consumer_key, outbox_event_id, replay_sequence) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

CREATE OR REPLACE FUNCTION app.capture_event_reconciliation(p_worker_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  run_id uuid := gen_random_uuid();
  backlog bigint;
  dead_letters bigint;
  lag bigint;
  oldest timestamptz;
  findings jsonb;
BEGIN
  SELECT count(*), min(occurred_at)
  INTO backlog, oldest
  FROM outbox_events
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

  SELECT count(*) INTO dead_letters
  FROM outbox_events
  WHERE published_at IS NULL AND dead_lettered_at IS NOT NULL;

  SELECT count(*) INTO lag
  FROM event_consumer_inbox
  WHERE state IN ('pending','retry','processing')
    AND first_seen_at < now() - interval '5 minutes';

  findings := jsonb_build_array(
    jsonb_build_object('code','outbox-backlog','count',backlog),
    jsonb_build_object('code','outbox-dead-letter','count',dead_letters),
    jsonb_build_object('code','consumer-lag','count',lag)
  );

  INSERT INTO event_reconciliation_runs (
    id, worker_id, state, backlog_count, dead_letter_count,
    consumer_lag_count, oldest_backlog_at, findings, completed_at
  ) VALUES (
    run_id, p_worker_id, 'completed', backlog, dead_letters,
    lag, oldest, findings, now()
  );
  RETURN run_id;
END
$$;

REVOKE ALL ON FUNCTION app.event_pattern_matches(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.enqueue_event_consumers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.capture_event_reconciliation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.event_pattern_matches(text,text) TO veza_worker, veza_control;
GRANT EXECUTE ON FUNCTION app.enqueue_event_consumers(uuid) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.capture_event_reconciliation(text) TO veza_worker;

GRANT SELECT, INSERT, UPDATE ON
  event_schema_registry,
  event_consumer_definitions,
  event_consumer_subscriptions,
  event_replay_requests,
  scheduled_jobs,
  scheduled_job_runs,
  event_reconciliation_runs
TO veza_control;

GRANT SELECT ON
  event_schema_registry,
  event_consumer_definitions,
  event_consumer_subscriptions,
  event_replay_requests,
  scheduled_jobs,
  scheduled_job_runs,
  event_reconciliation_runs,
  event_delivery_evidence,
  event_consumer_inbox
TO veza_control;

GRANT SELECT, INSERT, UPDATE ON
  event_consumer_inbox,
  event_delivery_evidence,
  event_replay_requests,
  scheduled_jobs,
  scheduled_job_runs,
  event_reconciliation_runs
TO veza_worker;
GRANT SELECT ON event_schema_registry, event_consumer_definitions, event_consumer_subscriptions TO veza_worker;

INSERT INTO event_consumer_definitions (
  consumer_key, display_name, handler_key, destination_type, status, created_by
)
SELECT 'platform.delivery-evidence', 'Platform delivery evidence',
       'platform.delivery-evidence', 'internal', 'active', users.id
FROM users
ORDER BY users.created_at, users.id
LIMIT 1
ON CONFLICT (consumer_key) DO NOTHING;

INSERT INTO event_consumer_subscriptions (
  consumer_key, event_pattern, minimum_major_version, maximum_major_version
)
SELECT 'platform.delivery-evidence', '*', 1, 99
WHERE EXISTS (
  SELECT 1 FROM event_consumer_definitions WHERE consumer_key = 'platform.delivery-evidence'
)
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
)
SELECT NULL, 'platform.event-reconciliation', 'platform.event-reconciliation',
       '{}'::jsonb, 300, now(), 'active', users.id
FROM users
ORDER BY users.created_at, users.id
LIMIT 1
ON CONFLICT (tenant_id, job_key) DO NOTHING;

COMMIT;
