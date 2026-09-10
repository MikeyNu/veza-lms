BEGIN;

ALTER TABLE notification_intents
  ADD COLUMN leased_at timestamptz,
  ADD COLUMN lease_owner text;

-- Existing processing intents predate explicit ownership. Mark them as stale
-- so the dispatcher can safely rebuild their idempotent delivery evidence.
UPDATE notification_intents
SET leased_at = to_timestamp(0),
    lease_owner = 'migration-recovery'
WHERE status = 'processing';

CREATE INDEX notification_intents_processing_lease_idx
  ON notification_intents(leased_at, created_at, id)
  WHERE status = 'processing';

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
    AND intent.lease_owner IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM notification_deliveries delivery
      WHERE delivery.notification_intent_id = intent.id
        AND delivery.state IN ('pending','processing','retry')
    );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

REVOKE ALL ON FUNCTION app.reconcile_notification_delivery_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reconcile_notification_delivery_state() TO veza_worker;

COMMIT;
