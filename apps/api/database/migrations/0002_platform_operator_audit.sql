CREATE TABLE platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_audit_events_time_idx
  ON platform_audit_events (occurred_at DESC, id DESC);
CREATE INDEX platform_audit_events_actor_idx
  ON platform_audit_events (actor_id, occurred_at DESC, id DESC);

GRANT SELECT, INSERT ON platform_audit_events TO veza_control;
