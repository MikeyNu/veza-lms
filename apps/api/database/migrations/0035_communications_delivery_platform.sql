BEGIN;

CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 160),
  topic_key text NOT NULL CHECK (topic_key ~ '^[a-z][a-z0-9.-]{2,119}$'),
  policy text NOT NULL DEFAULT 'optional' CHECK (policy IN ('required','optional')),
  default_channels text[] NOT NULL CHECK (
    cardinality(default_channels) > 0 AND
    default_channels <@ ARRAY['email','sms','push']::text[]
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, template_key)
);

CREATE TABLE notification_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  subject_template text,
  body_template text NOT NULL CHECK (length(body_template) BETWEEN 1 AND 262144),
  content_type text NOT NULL DEFAULT 'text/plain'
    CHECK (content_type IN ('text/plain','text/html','application/json')),
  variable_schema jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variable_schema) = 'object'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','active','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  submitted_by uuid REFERENCES users(id),
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, template_id, version_number),
  FOREIGN KEY (tenant_id, template_id) REFERENCES notification_templates(tenant_id, id) ON DELETE CASCADE,
  CHECK ((submitted_by IS NULL) = (submitted_at IS NULL)),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (approval_reason IS NULL OR length(btrim(approval_reason)) BETWEEN 10 AND 1000)
);
CREATE UNIQUE INDEX notification_template_one_active_version_idx
  ON notification_template_versions(tenant_id, template_id)
  WHERE status = 'active';

CREATE TABLE tenant_sender_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9.-]{1,79}$'),
  sender_identity text NOT NULL CHECK (length(btrim(sender_identity)) BETWEEN 2 AND 320),
  reply_to text,
  secret_reference text NOT NULL CHECK (secret_reference ~ '^[A-Za-z0-9/_+=.@:-]{3,512}$'),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  status text NOT NULL DEFAULT 'pending-verification'
    CHECK (status IN ('pending-verification','active','suspended','retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, channel, provider_key, sender_identity)
);
CREATE UNIQUE INDEX tenant_sender_one_active_channel_idx
  ON tenant_sender_configurations(tenant_id, channel)
  WHERE status = 'active';

CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  recipient_person_id uuid,
  topic_key text NOT NULL CHECK (topic_key ~ '^[a-z*][a-z0-9.*-]{0,119}$'),
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  state text NOT NULL DEFAULT 'enabled' CHECK (state IN ('enabled','disabled','digest')),
  digest_frequency text CHECK (digest_frequency IS NULL OR digest_frequency IN ('daily','weekly')),
  quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quiet_hours) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE NULLS NOT DISTINCT (
    tenant_id, recipient_user_id, recipient_person_id, topic_key, channel
  ),
  FOREIGN KEY (tenant_id, recipient_person_id) REFERENCES people(tenant_id, id),
  CHECK ((recipient_user_id IS NOT NULL)::int + (recipient_person_id IS NOT NULL)::int = 1),
  CHECK ((state = 'digest') = (digest_frequency IS NOT NULL))
);

CREATE TABLE notification_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid,
  template_key text NOT NULL,
  topic_key text NOT NULL,
  policy text NOT NULL CHECK (policy IN ('required','optional')),
  requested_channels text[] NOT NULL CHECK (
    cardinality(requested_channels) > 0 AND
    requested_channels <@ ARRAY['email','sms','push']::text[]
  ),
  recipient_user_id uuid REFERENCES users(id),
  recipient_person_id uuid,
  recipient_snapshot jsonb NOT NULL CHECK (jsonb_typeof(recipient_snapshot) = 'object'),
  variables jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variables) = 'object'),
  deduplication_key text NOT NULL CHECK (length(deduplication_key) BETWEEN 8 AND 200),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','suppressed','digested','completed','dead-letter','cancelled')),
  source_event_id uuid REFERENCES outbox_events(id),
  correlation_id text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, deduplication_key),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, recipient_person_id) REFERENCES people(tenant_id, id),
  CHECK ((recipient_user_id IS NOT NULL)::int + (recipient_person_id IS NOT NULL)::int <= 1)
);
CREATE INDEX notification_intents_due_idx
  ON notification_intents(scheduled_at, created_at, id)
  WHERE status = 'pending';

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_intent_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  provider_key text NOT NULL,
  sender_snapshot jsonb NOT NULL CHECK (jsonb_typeof(sender_snapshot) = 'object'),
  recipient_snapshot jsonb NOT NULL CHECK (jsonb_typeof(recipient_snapshot) = 'object'),
  content_snapshot jsonb NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object'),
  content_checksum text NOT NULL CHECK (content_checksum ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','sent','delivered','retry','suppressed','bounced','complained','failed','dead-letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  lease_owner text,
  provider_message_id text,
  provider_status text,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, notification_intent_id, channel),
  UNIQUE NULLS NOT DISTINCT (provider_key, provider_message_id),
  FOREIGN KEY (tenant_id, notification_intent_id) REFERENCES notification_intents(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_deliveries_claimable_idx
  ON notification_deliveries(next_attempt_at, created_at, id)
  WHERE state IN ('pending','retry');

CREATE TABLE notification_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  provider_event_id text NOT NULL,
  provider_message_id text,
  event_type text NOT NULL CHECK (
    event_type IN ('accepted','delivered','deferred','bounce','complaint','failed','opened','clicked')
  ),
  recipient_hash text CHECK (recipient_hash IS NULL OR recipient_hash ~ '^[a-f0-9]{64}$'),
  payload_checksum text NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, provider_event_id)
);

CREATE TABLE notification_digest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  notification_intent_id uuid NOT NULL,
  recipient_key text NOT NULL CHECK (length(recipient_key) BETWEEN 8 AND 200),
  channel text NOT NULL CHECK (channel IN ('email','push')),
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','batched','sent','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, notification_intent_id, channel),
  FOREIGN KEY (tenant_id, notification_intent_id) REFERENCES notification_intents(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_digest_items_due_idx
  ON notification_digest_items(due_at, recipient_key)
  WHERE status = 'pending';

CREATE TABLE notification_digest_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','push')),
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly')),
  recipient_snapshot jsonb NOT NULL CHECK (jsonb_typeof(recipient_snapshot) = 'object'),
  item_snapshot jsonb NOT NULL CHECK (jsonb_typeof(item_snapshot) = 'array'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','processing','sent','retry','dead-letter')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (tenant_id, id)
);
CREATE INDEX notification_digest_batches_due_idx
  ON notification_digest_batches(next_attempt_at, created_at, id)
  WHERE state IN ('pending','retry');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'notification_templates',
    'notification_template_versions',
    'tenant_sender_configurations',
    'notification_preferences',
    'notification_intents',
    'notification_deliveries',
    'notification_provider_events',
    'notification_digest_items',
    'notification_digest_batches'
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

CREATE OR REPLACE FUNCTION app.protect_active_notification_template()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'active' AND (
    NEW.subject_template IS DISTINCT FROM OLD.subject_template OR
    NEW.body_template IS DISTINCT FROM OLD.body_template OR
    NEW.content_type IS DISTINCT FROM OLD.content_type OR
    NEW.variable_schema IS DISTINCT FROM OLD.variable_schema OR
    NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'active notification template versions are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER notification_template_active_immutable
BEFORE UPDATE ON notification_template_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_active_notification_template();

CREATE OR REPLACE FUNCTION app.prepare_notification_digests(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE prepared integer;
BEGIN
  WITH groups AS (
    SELECT tenant_id, recipient_key, channel, frequency,
           min(id) first_item_id,
           jsonb_agg(
             jsonb_build_object(
               'intentId', intent.id,
               'templateKey', intent.template_key,
               'topicKey', intent.topic_key,
               'variables', intent.variables,
               'createdAt', intent.created_at
             ) ORDER BY intent.created_at, intent.id
           ) items,
           (array_agg(intent.recipient_snapshot ORDER BY intent.created_at, intent.id))[1] recipient_snapshot
    FROM notification_digest_items item
    JOIN notification_intents intent
      ON intent.tenant_id = item.tenant_id
     AND intent.id = item.notification_intent_id
    WHERE item.status = 'pending' AND item.due_at <= now()
    GROUP BY tenant_id, recipient_key, channel, frequency
    ORDER BY min(item.due_at), min(item.id)
    LIMIT p_limit
  ), inserted AS (
    INSERT INTO notification_digest_batches (
      tenant_id, recipient_key, channel, frequency, recipient_snapshot, item_snapshot
    )
    SELECT tenant_id, recipient_key, channel, frequency, recipient_snapshot, items
    FROM groups
    RETURNING tenant_id, recipient_key, channel, frequency
  )
  UPDATE notification_digest_items item
  SET status = 'batched'
  FROM inserted
  WHERE item.tenant_id = inserted.tenant_id
    AND item.recipient_key = inserted.recipient_key
    AND item.channel = inserted.channel
    AND item.frequency = inserted.frequency
    AND item.status = 'pending'
    AND item.due_at <= now();
  GET DIAGNOSTICS prepared = ROW_COUNT;
  RETURN prepared;
END
$$;
REVOKE ALL ON FUNCTION app.prepare_notification_digests(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prepare_notification_digests(integer) TO veza_worker;

INSERT INTO event_consumer_definitions (
  consumer_key, display_name, handler_key, destination_type,
  maximum_attempts, lease_seconds, status, created_by
) VALUES (
  'communications.notification-router',
  'Communications notification router',
  'communications.notification-router',
  'notification',
  12,
  60,
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
  ('communications.notification-router', 'notification.*', 1, 99),
  ('communications.notification-router', 'identity.membership-invitation.*', 1, 99),
  ('communications.notification-router', 'assessment.result.*', 1, 99),
  ('communications.notification-router', 'credential.certificate.*', 1, 99)
ON CONFLICT (consumer_key, event_pattern) DO UPDATE
SET minimum_major_version = EXCLUDED.minimum_major_version,
    maximum_major_version = EXCLUDED.maximum_major_version;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,
  'communications.digest-preparation',
  'communications.digest-preparation',
  '{"batchSize":100}'::jsonb,
  900,
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
