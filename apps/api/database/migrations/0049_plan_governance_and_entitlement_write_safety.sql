BEGIN;

CREATE OR REPLACE FUNCTION app.prevent_plan_baseline_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $$
DECLARE target_tenant uuid;
DECLARE target_module text;
BEGIN
  target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  target_module := CASE WHEN TG_OP = 'DELETE' THEN OLD.module_key ELSE NEW.module_key END;

  IF current_setting('app.data_plane', true) = 'control'
     AND current_setting('app.allow_plan_baseline_write', true) <> 'true'
     AND EXISTS (
       SELECT 1
       FROM tenant_entitlement_overrides override
       WHERE override.tenant_id = target_tenant
         AND override.module_key = target_module
         AND override.created_at = transaction_timestamp()
     ) THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Plan baseline deletion is not allowed during an entitlement override';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TABLE plan_module_catalogue (
  module_key text PRIMARY KEY CHECK (module_key ~ '^[a-z][a-z0-9-]{2,79}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 1000),
  category text NOT NULL CHECK (category IN ('core','learning','operations','engagement','analytics','integration','ai')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  quota_schema jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quota_schema) = 'object'),
  billing_metric_key text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plan_module_catalogue (
  module_key, display_name, description, category, status, quota_schema
) VALUES
  ('core','Core learning','Core institution, identity, catalogue and learning delivery capabilities.','core','active','{"activeLearners":{"type":"integer","minimum":1}}'::jsonb),
  ('studio-pro','Studio Pro','Advanced authoring, media processing and reusable learning asset capabilities.','learning','active','{"storageBytes":{"type":"integer","minimum":0}}'::jsonb),
  ('exams','Exams','Formal assessment, controlled examination and academic evidence capabilities.','learning','active','{"annualExamAttempts":{"type":"integer","minimum":0}}'::jsonb),
  ('commerce','Commerce','Commercial enrolment, pricing and payment integration capabilities.','operations','active','{}'::jsonb),
  ('advanced-analytics','Advanced analytics','Institution-level analytics, governed metrics and advanced reporting capabilities.','analytics','active','{"monthlyQueries":{"type":"integer","minimum":0}}'::jsonb),
  ('credentials','Credentials','Credential issue, verification and learner achievement portability capabilities.','engagement','active','{"annualCredentials":{"type":"integer","minimum":0}}'::jsonb),
  ('guardian-portal','Guardian portal','Guardian communication, consent and learner-support visibility capabilities.','engagement','active','{}'::jsonb),
  ('ai-assist','AI assist','Governed AI-assisted authoring and learning support capabilities.','ai','active','{"monthlyTokens":{"type":"integer","minimum":0}}'::jsonb),
  ('integration-hub','Integration hub','Managed API, webhook and external system integration capabilities.','integration','active','{"monthlyApiRequests":{"type":"integer","minimum":0}}'::jsonb)
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE plan_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL REFERENCES plans(key) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 2000),
  lifecycle text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft','scheduled','active','retired','cancelled')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  default_trial_days integer NOT NULL DEFAULT 0 CHECK (default_trial_days BETWEEN 0 AND 365),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  billing_product_reference text,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_key, version_number),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (lifecycle NOT IN ('scheduled','active','retired') OR approved_by IS NOT NULL)
);
CREATE UNIQUE INDEX plan_policy_one_active_idx
  ON plan_policy_versions (plan_key) WHERE lifecycle = 'active';
CREATE INDEX plan_policy_versions_plan_time_idx
  ON plan_policy_versions (plan_key, effective_from DESC, version_number DESC);

CREATE TABLE plan_policy_module_entitlements (
  plan_policy_version_id uuid NOT NULL REFERENCES plan_policy_versions(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES plan_module_catalogue(module_key) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('enabled','disabled','trial')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  trial_days integer NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_policy_version_id, module_key),
  CHECK (state = 'trial' OR trial_days = 0)
);

CREATE TABLE plan_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL REFERENCES plans(key) ON DELETE RESTRICT,
  policy_version_id uuid REFERENCES plan_policy_versions(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created','submitted','approved','scheduled','activated','retired','cancelled',
    'module-configured','tenant-assigned'
  )),
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  correlation_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_change_history_plan_time_idx
  ON plan_change_history (plan_key, occurred_at DESC, id DESC);

CREATE OR REPLACE FUNCTION app.project_active_plan_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $$
DECLARE tenant_record record;
DECLARE entitlement_record record;
DECLARE trial_until timestamptz;
BEGIN
  IF NEW.lifecycle = 'active' AND (OLD.lifecycle IS DISTINCT FROM 'active') THEN
    UPDATE plan_policy_versions
       SET lifecycle = 'retired', effective_until = COALESCE(effective_until, NEW.effective_from),
           version = version + 1, updated_at = now()
     WHERE plan_key = NEW.plan_key AND id <> NEW.id AND lifecycle = 'active';

    UPDATE plans
       SET display_name = NEW.display_name,
           limits = NEW.limits,
           active = true,
           updated_at = now()
     WHERE key = NEW.plan_key;

    PERFORM set_config('app.allow_plan_baseline_write', 'true', true);
    FOR tenant_record IN
      SELECT id FROM tenants WHERE plan_key = NEW.plan_key AND status <> 'closed'
    LOOP
      FOR entitlement_record IN
        SELECT module_key, state, limits, trial_days
        FROM plan_policy_module_entitlements
        WHERE plan_policy_version_id = NEW.id
      LOOP
        trial_until := CASE
          WHEN entitlement_record.state = 'trial'
            THEN NEW.effective_from + (entitlement_record.trial_days * interval '1 day')
          ELSE NEW.effective_until
        END;
        INSERT INTO tenant_entitlements (
          tenant_id, module_key, state, limits, valid_from, valid_until
        ) VALUES (
          tenant_record.id, entitlement_record.module_key, entitlement_record.state,
          entitlement_record.limits, NEW.effective_from, trial_until
        )
        ON CONFLICT (tenant_id, module_key) DO UPDATE SET
          state = EXCLUDED.state,
          limits = EXCLUDED.limits,
          valid_from = EXCLUDED.valid_from,
          valid_until = EXCLUDED.valid_until,
          updated_at = now();
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS plan_policy_activation_projection ON plan_policy_versions;
CREATE TRIGGER plan_policy_activation_projection
AFTER UPDATE OF lifecycle ON plan_policy_versions
FOR EACH ROW EXECUTE FUNCTION app.project_active_plan_policy();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'plan_module_catalogue','plan_policy_versions',
    'plan_policy_module_entitlements','plan_change_history'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, veza_app, veza_worker', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE %I TO veza_control', table_name);
  END LOOP;
END
$$;
REVOKE UPDATE, DELETE ON plan_change_history FROM veza_control;
REVOKE ALL ON FUNCTION app.project_active_plan_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_active_plan_policy() TO veza_control;

COMMIT;
