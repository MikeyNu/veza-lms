CREATE TABLE platform_operation_requests (
  idempotency_key text PRIMARY KEY,
  operation_type text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  response jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_operation_requests_resource_idx
  ON platform_operation_requests (resource_type, resource_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON platform_operation_requests TO veza_control;

COMMENT ON TABLE platform_operation_requests IS
  'Control-plane idempotency ledger for consequential operator actions. Application and worker identities receive no access.';
