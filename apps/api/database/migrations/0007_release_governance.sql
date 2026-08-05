CREATE TABLE release_rings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 80),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 500),
  sequence smallint NOT NULL UNIQUE CHECK (sequence > 0),
  lifecycle text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'retired')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO release_rings (key, display_name, description, sequence)
VALUES
  ('internal', 'Internal', 'Veza-operated validation environments and staff workspaces.', 10),
  ('design-partner', 'Design partners', 'Named institutions validating a governed capability before preview.', 20),
  ('preview', 'Preview', 'Opted-in institutions receiving release-candidate capability.', 30),
  ('general-availability', 'General availability', 'Default production ring for supported capabilities.', 40)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 100),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 1000),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft', 'active', 'retired')),
  default_enabled boolean NOT NULL DEFAULT false,
  required_module_key text CHECK (required_module_key IS NULL OR required_module_key IN (
    'core', 'studio-pro', 'exams', 'commerce', 'advanced-analytics',
    'credentials', 'guardian-portal', 'ai-assist', 'integration-hub'
  )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE release_ring_feature_flags (
  ring_key text NOT NULL REFERENCES release_rings(key) ON DELETE RESTRICT,
  feature_flag_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  configured_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ring_key, feature_flag_key)
);

CREATE TABLE tenant_release_assignments (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  ring_key text NOT NULL REFERENCES release_rings(key) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tenant_release_assignments_ring_idx
  ON tenant_release_assignments (ring_key, tenant_id);

CREATE TABLE tenant_feature_flag_overrides (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_flag_key text NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 20 AND 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  configured_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_flag_key)
);

CREATE INDEX tenant_feature_flag_overrides_flag_idx
  ON tenant_feature_flag_overrides (feature_flag_key, tenant_id);

GRANT SELECT, INSERT, UPDATE ON release_rings, feature_flags, release_ring_feature_flags,
  tenant_release_assignments, tenant_feature_flag_overrides TO veza_control;

CREATE OR REPLACE FUNCTION app.current_feature_flags()
RETURNS TABLE (
  flag_key text,
  enabled boolean,
  source text,
  ring_key text,
  configuration_version integer,
  required_module_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH tenant_context AS (
    SELECT app.current_tenant_id() AS tenant_id
    WHERE app.current_tenant_id() IS NOT NULL
  ),
  selected_ring AS (
    SELECT COALESCE(assignment.ring_key, 'general-availability') AS ring_key
    FROM tenant_context context
    LEFT JOIN tenant_release_assignments assignment ON assignment.tenant_id = context.tenant_id
  ),
  active_entitlements AS (
    SELECT entitlement.module_key
    FROM tenant_entitlements entitlement
    JOIN tenant_context context ON context.tenant_id = entitlement.tenant_id
    WHERE entitlement.state IN ('enabled', 'trial')
      AND entitlement.valid_from <= now()
      AND (entitlement.valid_until IS NULL OR entitlement.valid_until > now())
  )
  SELECT
    flag.key,
    CASE
      WHEN flag.required_module_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM active_entitlements e WHERE e.module_key = flag.required_module_key)
        THEN false
      ELSE COALESCE(tenant_override.enabled, ring_setting.enabled, flag.default_enabled)
    END AS enabled,
    CASE
      WHEN flag.required_module_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM active_entitlements e WHERE e.module_key = flag.required_module_key)
        THEN 'entitlement'
      WHEN tenant_override.feature_flag_key IS NOT NULL THEN 'tenant-override'
      WHEN ring_setting.feature_flag_key IS NOT NULL THEN 'release-ring'
      ELSE 'default'
    END AS source,
    selected_ring.ring_key,
    GREATEST(
      flag.version,
      COALESCE(ring_setting.version, 0),
      COALESCE(tenant_override.version, 0)
    ) AS configuration_version,
    flag.required_module_key
  FROM feature_flags flag
  CROSS JOIN selected_ring
  LEFT JOIN release_ring_feature_flags ring_setting
    ON ring_setting.ring_key = selected_ring.ring_key
   AND ring_setting.feature_flag_key = flag.key
  LEFT JOIN tenant_context context ON true
  LEFT JOIN tenant_feature_flag_overrides tenant_override
    ON tenant_override.tenant_id = context.tenant_id
   AND tenant_override.feature_flag_key = flag.key
  WHERE flag.lifecycle = 'active'
  ORDER BY flag.key
$$;

REVOKE ALL ON FUNCTION app.current_feature_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_feature_flags() TO veza_app;

COMMENT ON TABLE feature_flags IS
  'Control-plane definitions for governed capability rollout. Application identities have no direct table access.';
COMMENT ON FUNCTION app.current_feature_flags() IS
  'Evaluates active feature flags for the transaction-local tenant with tenant override, release ring, default and entitlement precedence.';
