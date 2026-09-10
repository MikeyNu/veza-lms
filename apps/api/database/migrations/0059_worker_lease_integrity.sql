BEGIN;

ALTER TABLE notification_intents
  ADD COLUMN leased_at timestamptz,
  ADD COLUMN lease_owner text;

CREATE INDEX notification_intents_processing_lease_idx
  ON notification_intents(leased_at, created_at, id)
  WHERE status = 'processing';

COMMIT;
