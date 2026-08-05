BEGIN;

ALTER TABLE notification_intents
  ADD COLUMN last_error text;

ALTER TABLE notification_digest_batches
  ADD COLUMN leased_at timestamptz,
  ADD COLUMN lease_owner text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE notification_recipient_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  recipient_hash text NOT NULL CHECK (recipient_hash ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (reason IN ('hard-bounce','complaint','invalid-recipient','manual')),
  provider_key text,
  source_provider_event_id uuid REFERENCES notification_provider_events(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  released_by uuid REFERENCES users(id),
  released_at timestamptz,
  release_reason text,
  UNIQUE (tenant_id, channel, recipient_hash, status),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK ((released_by IS NULL) = (released_at IS NULL)),
  CHECK (release_reason IS NULL OR length(btrim(release_reason)) BETWEEN 10 AND 1000)
);
ALTER TABLE notification_recipient_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipient_suppressions FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_recipient_suppressions_tenant_isolation
  ON notification_recipient_suppressions
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON notification_recipient_suppressions TO veza_app, veza_worker;
GRANT SELECT ON notification_recipient_suppressions TO veza_control;

CREATE INDEX notification_recipient_suppressions_active_idx
  ON notification_recipient_suppressions(tenant_id, channel, recipient_hash)
  WHERE status = 'active';

CREATE INDEX notification_digest_batches_claimable_idx
  ON notification_digest_batches(next_attempt_at, created_at, id)
  WHERE state IN ('pending','retry');

CREATE OR REPLACE FUNCTION app.prepare_notification_digests(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  prepared integer;
BEGIN
  WITH grouped AS (
    SELECT item.tenant_id,
           item.recipient_key,
           item.channel,
           item.frequency,
           jsonb_agg(
             jsonb_build_object(
               'intentId', intent.id,
               'templateKey', intent.template_key,
               'topicKey', intent.topic_key,
               'variables', intent.variables,
               'createdAt', intent.created_at
             ) ORDER BY intent.created_at, intent.id
           ) AS items,
           (array_agg(intent.recipient_snapshot ORDER BY intent.created_at, intent.id))[1]
             AS recipient_snapshot
    FROM notification_digest_items item
    JOIN notification_intents intent
      ON intent.tenant_id = item.tenant_id
     AND intent.id = item.notification_intent_id
    WHERE item.status = 'pending'
      AND item.due_at <= now()
    GROUP BY item.tenant_id, item.recipient_key, item.channel, item.frequency
    ORDER BY min(item.due_at), min(item.id)
    LIMIT p_limit
  ), inserted AS (
    INSERT INTO notification_digest_batches (
      tenant_id, recipient_key, channel, frequency,
      recipient_snapshot, item_snapshot
    )
    SELECT tenant_id, recipient_key, channel, frequency,
           recipient_snapshot, items
    FROM grouped
    RETURNING tenant_id, recipient_key, channel, frequency
  ), updated AS (
    UPDATE notification_digest_items item
    SET status = 'batched'
    FROM inserted
    WHERE item.tenant_id = inserted.tenant_id
      AND item.recipient_key = inserted.recipient_key
      AND item.channel = inserted.channel
      AND item.frequency = inserted.frequency
      AND item.status = 'pending'
      AND item.due_at <= now()
    RETURNING item.id
  )
  SELECT count(*) INTO prepared FROM updated;
  RETURN prepared;
END
$$;

CREATE OR REPLACE FUNCTION app.apply_notification_provider_event(
  p_tenant_id uuid,
  p_provider_key text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_recipient_hash text,
  p_payload_checksum text,
  p_evidence jsonb,
  p_occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  provider_event_id uuid;
  delivery_id uuid;
  delivery_channel text;
BEGIN
  INSERT INTO notification_provider_events (
    tenant_id, provider_key, provider_event_id, provider_message_id,
    event_type, recipient_hash, payload_checksum, evidence, occurred_at
  ) VALUES (
    p_tenant_id, p_provider_key, p_provider_event_id, p_provider_message_id,
    p_event_type, p_recipient_hash, p_payload_checksum, p_evidence, p_occurred_at
  )
  ON CONFLICT (provider_key, provider_event_id)
  DO UPDATE SET provider_event_id = notification_provider_events.provider_event_id
  RETURNING id INTO provider_event_id;

  SELECT delivery.id, delivery.channel
  INTO delivery_id, delivery_channel
  FROM notification_deliveries delivery
  WHERE delivery.tenant_id = p_tenant_id
    AND delivery.provider_key = p_provider_key
    AND delivery.provider_message_id = p_provider_message_id
  FOR UPDATE;

  IF delivery_id IS NOT NULL THEN
    UPDATE notification_deliveries
    SET state = CASE p_event_type
          WHEN 'delivered' THEN 'delivered'
          WHEN 'bounce' THEN 'bounced'
          WHEN 'complaint' THEN 'complained'
          WHEN 'failed' THEN 'failed'
          WHEN 'deferred' THEN 'retry'
          ELSE state
        END,
        provider_status = p_event_type,
        delivered_at = CASE WHEN p_event_type = 'delivered' THEN p_occurred_at ELSE delivered_at END,
        next_attempt_at = CASE
          WHEN p_event_type = 'deferred' THEN now() + interval '5 minutes'
          ELSE next_attempt_at
        END,
        updated_at = now()
    WHERE id = delivery_id;
  END IF;

  IF p_recipient_hash IS NOT NULL
     AND delivery_channel IS NOT NULL
     AND p_event_type IN ('bounce','complaint') THEN
    INSERT INTO notification_recipient_suppressions (
      tenant_id, channel, recipient_hash, reason,
      provider_key, source_provider_event_id
    ) VALUES (
      p_tenant_id,
      delivery_channel,
      p_recipient_hash,
      CASE WHEN p_event_type = 'complaint' THEN 'complaint' ELSE 'hard-bounce' END,
      p_provider_key,
      provider_event_id
    )
    ON CONFLICT (tenant_id, channel, recipient_hash, status) DO NOTHING;
  END IF;

  RETURN provider_event_id;
END
$$;

REVOKE ALL ON FUNCTION app.prepare_notification_digests(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.apply_notification_provider_event(
  uuid,text,text,text,text,text,text,jsonb,timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prepare_notification_digests(integer) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.apply_notification_provider_event(
  uuid,text,text,text,text,text,text,jsonb,timestamptz
) TO veza_app, veza_worker;

COMMIT;
