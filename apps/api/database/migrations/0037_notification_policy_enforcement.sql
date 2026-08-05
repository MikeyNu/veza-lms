BEGIN;

CREATE OR REPLACE FUNCTION app.notification_recipient_hash(
  p_channel text,
  p_recipient_snapshot jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      lower(
        CASE p_channel
          WHEN 'email' THEN COALESCE(p_recipient_snapshot->>'email','')
          WHEN 'sms' THEN regexp_replace(COALESCE(p_recipient_snapshot->>'phone',''),'\s+','','g')
          WHEN 'push' THEN COALESCE(p_recipient_snapshot->>'pushToken','')
          ELSE ''
        END
      ),
      'sha256'
    ),
    'hex'
  )
$$;

CREATE OR REPLACE FUNCTION app.notification_quiet_end(
  p_quiet_hours jsonb,
  p_reference timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  zone_name text := COALESCE(NULLIF(p_quiet_hours->>'timezone',''),'Africa/Johannesburg');
  start_time time;
  end_time time;
  local_reference timestamp;
  local_date date;
  local_time time;
  end_date date;
BEGIN
  IF NOT (p_quiet_hours ? 'start') OR NOT (p_quiet_hours ? 'end') THEN
    RETURN p_reference;
  END IF;
  BEGIN
    start_time := (p_quiet_hours->>'start')::time;
    end_time := (p_quiet_hours->>'end')::time;
    local_reference := p_reference AT TIME ZONE zone_name;
  EXCEPTION WHEN OTHERS THEN
    RETURN p_reference;
  END;
  local_date := local_reference::date;
  local_time := local_reference::time;

  IF start_time = end_time THEN
    RETURN p_reference;
  END IF;

  IF start_time < end_time THEN
    IF local_time >= start_time AND local_time < end_time THEN
      RETURN (local_date + end_time) AT TIME ZONE zone_name;
    END IF;
    RETURN p_reference;
  END IF;

  IF local_time >= start_time THEN
    end_date := local_date + 1;
    RETURN (end_date + end_time) AT TIME ZONE zone_name;
  END IF;
  IF local_time < end_time THEN
    RETURN (local_date + end_time) AT TIME ZONE zone_name;
  END IF;
  RETURN p_reference;
END
$$;

CREATE OR REPLACE FUNCTION app.apply_notification_intent_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  channel_name text;
  preference_record record;
  deferred_until timestamptz := NEW.scheduled_at;
BEGIN
  IF NEW.policy = 'required' THEN
    RETURN NEW;
  END IF;

  FOREACH channel_name IN ARRAY NEW.requested_channels LOOP
    SELECT preference.state, preference.quiet_hours
    INTO preference_record
    FROM notification_preferences preference
    WHERE preference.tenant_id = NEW.tenant_id
      AND preference.recipient_user_id IS NOT DISTINCT FROM NEW.recipient_user_id
      AND preference.recipient_person_id IS NOT DISTINCT FROM NEW.recipient_person_id
      AND preference.channel = channel_name
      AND preference.topic_key IN (NEW.topic_key, '*')
    ORDER BY (preference.topic_key = NEW.topic_key) DESC, preference.updated_at DESC
    LIMIT 1;

    IF FOUND AND preference_record.state <> 'disabled' THEN
      deferred_until := GREATEST(
        deferred_until,
        app.notification_quiet_end(preference_record.quiet_hours, NEW.scheduled_at)
      );
    END IF;
  END LOOP;
  NEW.scheduled_at := deferred_until;
  RETURN NEW;
END
$$;
CREATE TRIGGER notification_intent_quiet_hours
BEFORE INSERT ON notification_intents
FOR EACH ROW EXECUTE FUNCTION app.apply_notification_intent_policy();

CREATE OR REPLACE FUNCTION app.apply_notification_delivery_suppression()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recipient_hash text;
BEGIN
  recipient_hash := app.notification_recipient_hash(NEW.channel, NEW.recipient_snapshot);
  IF recipient_hash <> encode(digest('', 'sha256'), 'hex')
     AND EXISTS (
       SELECT 1
       FROM notification_recipient_suppressions suppression
       WHERE suppression.tenant_id = NEW.tenant_id
         AND suppression.channel = NEW.channel
         AND suppression.recipient_hash = recipient_hash
         AND suppression.status = 'active'
         AND (suppression.expires_at IS NULL OR suppression.expires_at > now())
     ) THEN
    NEW.state := 'suppressed';
    NEW.provider_key := 'suppression';
    NEW.sender_snapshot := jsonb_build_object('policy','recipient-suppression');
    NEW.content_snapshot := NEW.content_snapshot || jsonb_build_object(
      'suppression','provider-feedback'
    );
    NEW.content_checksum := encode(digest(NEW.content_snapshot::text, 'sha256'), 'hex');
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER notification_delivery_suppression
BEFORE INSERT ON notification_deliveries
FOR EACH ROW EXECUTE FUNCTION app.apply_notification_delivery_suppression();

CREATE OR REPLACE FUNCTION app.reconcile_notification_delivery_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  changed integer;
BEGIN
  UPDATE notification_deliveries
  SET state = 'retry',
      next_attempt_at = now(),
      leased_at = NULL,
      lease_owner = NULL,
      last_error = COALESCE(last_error, 'stale-delivery-lease-recovered'),
      updated_at = now()
  WHERE state = 'processing'
    AND leased_at < now() - interval '5 minutes';

  UPDATE notification_digest_batches
  SET state = 'retry',
      next_attempt_at = now(),
      leased_at = NULL,
      lease_owner = NULL,
      last_error = COALESCE(last_error, 'stale-digest-lease-recovered'),
      updated_at = now()
  WHERE state = 'processing'
    AND leased_at < now() - interval '5 minutes';

  UPDATE notification_intents intent
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM notification_deliveries delivery
          WHERE delivery.notification_intent_id = intent.id
            AND delivery.state = 'dead-letter'
        ) THEN 'dead-letter'
        WHEN EXISTS (
          SELECT 1 FROM notification_deliveries delivery
          WHERE delivery.notification_intent_id = intent.id
            AND delivery.state = 'suppressed'
        ) THEN 'suppressed'
        ELSE 'completed'
      END,
      completed_at = now()
  WHERE intent.status = 'processing'
    AND NOT EXISTS (
      SELECT 1 FROM notification_deliveries delivery
      WHERE delivery.notification_intent_id = intent.id
        AND delivery.state IN ('pending','processing','retry')
    );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

REVOKE ALL ON FUNCTION app.notification_recipient_hash(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.notification_quiet_end(jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reconcile_notification_delivery_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.notification_recipient_hash(text,jsonb) TO veza_app, veza_worker;
GRANT EXECUTE ON FUNCTION app.notification_quiet_end(jsonb,timestamptz) TO veza_app, veza_worker;
GRANT EXECUTE ON FUNCTION app.reconcile_notification_delivery_state() TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, created_by
) VALUES (
  NULL,
  'communications.delivery-reconciliation',
  'communications.delivery-reconciliation',
  '{}'::jsonb,
  60,
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
