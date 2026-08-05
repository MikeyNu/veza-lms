ALTER TABLE outbox_events
  ADD COLUMN leased_at timestamptz,
  ADD COLUMN lease_owner text,
  ADD COLUMN last_error text,
  ADD COLUMN published_reference text,
  ADD COLUMN dead_lettered_at timestamptz;

CREATE INDEX outbox_claimable_idx
  ON outbox_events (next_attempt_at, occurred_at, id)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE INDEX outbox_dead_letter_idx
  ON outbox_events (dead_lettered_at DESC, occurred_at DESC)
  WHERE dead_lettered_at IS NOT NULL;

GRANT SELECT, UPDATE ON outbox_events TO veza_worker;

COMMENT ON COLUMN outbox_events.leased_at IS
  'Time a dedicated event worker claimed this event. Expired leases may be reclaimed.';
COMMENT ON COLUMN outbox_events.lease_owner IS
  'Opaque worker instance identifier used to prevent one worker acknowledging another worker lease.';
COMMENT ON COLUMN outbox_events.dead_lettered_at IS
  'Set only after the configured maximum delivery attempts are exhausted. Requeue requires an audited operator workflow.';
