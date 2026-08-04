CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TABLE plans (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (key, display_name, limits)
VALUES
  ('foundation', 'Foundation', '{"activeLearners":500,"institutions":1}'::jsonb),
  ('growth', 'Growth', '{"activeLearners":5000,"institutions":5}'::jsonb),
  ('enterprise', 'Enterprise', '{"activeLearners":50000,"institutions":50}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  email citext,
  display_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_issuer, identity_subject)
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext NOT NULL UNIQUE,
  display_name text NOT NULL,
  legal_name text NOT NULL,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'suspended', 'offboarding', 'closed')),
  deployment_tier text NOT NULL
    CHECK (deployment_tier IN ('shared', 'protected', 'sovereign')),
  residency_region text NOT NULL,
  plan_key text NOT NULL REFERENCES plans(key),
  locale text NOT NULL DEFAULT 'en-ZA',
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_entitlements (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key IN (
    'core', 'studio-pro', 'exams', 'commerce', 'advanced-analytics',
    'credentials', 'guardian-portal', 'ai-assist', 'integration-hub'
  )),
  state text NOT NULL DEFAULT 'enabled' CHECK (state IN ('enabled', 'disabled', 'trial')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, module_key),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'expired', 'revoked')),
  locale text NOT NULL DEFAULT 'en-ZA',
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role_key text NOT NULL CHECK (role_key IN (
    'tenant-owner', 'institution-admin', 'registrar', 'curriculum-manager',
    'course-manager', 'instructor', 'assessor', 'moderator', 'learner',
    'guardian-sponsor', 'auditor', 'support-agent'
  )),
  scope_type text NOT NULL CHECK (scope_type IN (
    'tenant', 'institution', 'campus', 'programme', 'course', 'cohort', 'self'
  )),
  scope_id uuid NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  assigned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX role_assignments_membership_active_idx
  ON role_assignments (tenant_id, membership_id, valid_from, valid_until);
CREATE INDEX role_assignments_scope_idx
  ON role_assignments (tenant_id, scope_type, scope_id);
CREATE UNIQUE INDEX role_assignments_unique_assignment_idx
  ON role_assignments (tenant_id, membership_id, role_key, scope_type, scope_id);

CREATE TABLE membership_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role_key text NOT NULL CHECK (role_key IN (
    'tenant-owner', 'institution-admin', 'registrar', 'curriculum-manager',
    'course-manager', 'instructor', 'assessor', 'moderator', 'learner',
    'guardian-sponsor', 'auditor', 'support-agent'
  )),
  scope_type text NOT NULL CHECK (scope_type IN (
    'tenant', 'institution', 'campus', 'programme', 'course', 'cohort', 'self'
  )),
  scope_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending-delivery'
    CHECK (status IN ('pending-delivery', 'sent', 'accepted', 'expired', 'revoked')),
  token_digest text,
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id),
  accepted_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX membership_invitations_open_email_idx
  ON membership_invitations (tenant_id, email, role_key, scope_type, scope_id)
  WHERE status IN ('pending-delivery', 'sent');

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plane text NOT NULL CHECK (plane IN ('control', 'application')),
  event_type text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  membership_id uuid,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  purpose text,
  correlation_id text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_time_idx
  ON audit_events (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_resource_idx
  ON audit_events (tenant_id, resource_type, resource_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_event_type_idx
  ON audit_events (tenant_id, event_type, occurred_at DESC, id DESC);
CREATE INDEX audit_events_actor_idx
  ON audit_events (tenant_id, actor_id, occurred_at DESC, id DESC);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  actor_id uuid NOT NULL REFERENCES users(id),
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_unpublished_idx
  ON outbox_events (next_attempt_at, occurred_at)
  WHERE published_at IS NULL;

CREATE TABLE provisioning_requests (
  idempotency_key text PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  tenant_id uuid REFERENCES tenants(id),
  response jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolation ON tenants
  USING (id = app.current_tenant_id())
  WITH CHECK (id = app.current_tenant_id());

ALTER TABLE tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_entitlements_isolation ON tenant_entitlements
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_isolation ON memberships
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY role_assignments_isolation ON role_assignments
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_invitations_isolation ON membership_invitations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_isolation ON audit_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_isolation ON outbox_events
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

COMMENT ON TABLE provisioning_requests IS
  'Control-plane idempotency ledger. Application-plane database roles must not receive access.';
COMMENT ON FUNCTION app.current_tenant_id() IS
  'Returns the transaction-local tenant context set by the application before tenant-owned queries.';

-- Runtime service identities are deliberately separate. veza_app is always
-- subject to RLS; veza_control may bypass RLS only through reviewed control-plane
-- and identity-directory repositories. The migration owner is never used at runtime.
GRANT USAGE ON SCHEMA public, app TO veza_app, veza_control;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO veza_app, veza_control;

GRANT SELECT ON plans TO veza_control;
GRANT SELECT, INSERT, UPDATE ON users, tenants, tenant_entitlements, memberships,
  role_assignments, membership_invitations, provisioning_requests TO veza_control;
GRANT SELECT, INSERT, UPDATE ON outbox_events TO veza_control;
GRANT SELECT, INSERT ON audit_events TO veza_control;

GRANT SELECT ON tenants, tenant_entitlements, memberships, role_assignments,
  membership_invitations, audit_events, outbox_events TO veza_app;
GRANT UPDATE ON tenants, memberships, role_assignments, membership_invitations,
  outbox_events TO veza_app;
GRANT INSERT ON memberships, role_assignments, membership_invitations,
  audit_events, outbox_events TO veza_app;

-- Future migrations grant access explicitly. There are intentionally no broad
-- default privileges because new control-plane tables must not become visible
-- to the application identity by accident.
