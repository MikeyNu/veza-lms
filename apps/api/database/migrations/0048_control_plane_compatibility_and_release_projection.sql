BEGIN;

ALTER TABLE release_rings
  ADD COLUMN IF NOT EXISTS ring_key text GENERATED ALWAYS AS (key) STORED,
  ADD COLUMN IF NOT EXISTS target_version text REFERENCES platform_release_versions(version_key) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS release_rings_ring_key_idx ON release_rings (ring_key);

ALTER TABLE tenant_release_exceptions
  ADD COLUMN IF NOT EXISTS pinned_version text GENERATED ALWAYS AS (pinned_release_version) STORED;

CREATE OR REPLACE VIEW release_ring_tenants AS
SELECT
  assignment.tenant_id,
  assignment.ring_key,
  assignment.reason,
  assignment.version,
  assignment.assigned_by,
  assignment.assigned_at,
  assignment.updated_at,
  assignment.effective_from,
  assignment.effective_until,
  assignment.is_canary
FROM tenant_release_assignments assignment;

REVOKE ALL ON release_ring_tenants FROM PUBLIC, veza_app, veza_worker;
GRANT SELECT ON release_ring_tenants TO veza_control;

CREATE OR REPLACE FUNCTION app.project_release_ring_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lifecycle IN ('active','completed') THEN
    UPDATE release_rings
       SET target_version = NEW.release_version,
           version = version + 1,
           updated_by = NEW.approved_by,
           updated_at = now()
     WHERE key = NEW.ring_key;
  ELSIF NEW.lifecycle = 'rolled-back' THEN
    UPDATE release_rings
       SET target_version = (
         SELECT target.release_version
         FROM release_ring_targets target
         WHERE target.ring_key = NEW.ring_key
           AND target.id <> NEW.id
           AND target.lifecycle IN ('active','completed')
           AND target.effective_from <= now()
         ORDER BY target.effective_from DESC, target.created_at DESC
         LIMIT 1
       ),
       version = version + 1,
       updated_by = NEW.approved_by,
       updated_at = now()
     WHERE key = NEW.ring_key;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS release_ring_target_projection ON release_ring_targets;
CREATE TRIGGER release_ring_target_projection
AFTER INSERT OR UPDATE OF lifecycle, release_version ON release_ring_targets
FOR EACH ROW EXECUTE FUNCTION app.project_release_ring_target();

CREATE OR REPLACE FUNCTION app.prevent_plan_baseline_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.data_plane', true) = 'control'
     AND current_setting('app.allow_plan_baseline_write', true) <> 'true' THEN
    RAISE EXCEPTION 'Tenant plan entitlements are immutable outside plan assignment';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_entitlement_plan_baseline_guard ON tenant_entitlements;
CREATE TRIGGER tenant_entitlement_plan_baseline_guard
BEFORE INSERT OR UPDATE OR DELETE ON tenant_entitlements
FOR EACH ROW EXECUTE FUNCTION app.prevent_plan_baseline_override();

REVOKE ALL ON FUNCTION app.project_release_ring_target() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.prevent_plan_baseline_override() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_release_ring_target() TO veza_control;
GRANT EXECUTE ON FUNCTION app.prevent_plan_baseline_override() TO veza_control;

COMMIT;
