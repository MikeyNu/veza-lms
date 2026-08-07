BEGIN;

CREATE TABLE tenant_plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES plans(key) ON DELETE RESTRICT,
  plan_policy_version_id uuid NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','applied','cancelled','failed')),
  effective_from timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  created_by uuid NOT NULL REFERENCES users(id),
  applied_by uuid REFERENCES users(id),
  applied_at timestamptz,
  failure_reason text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (applied_at IS NULL OR state = 'applied')
);
CREATE UNIQUE INDEX tenant_one_scheduled_plan_assignment_idx
  ON tenant_plan_assignments (tenant_id) WHERE state = 'scheduled';
CREATE INDEX tenant_plan_assignments_due_idx
  ON tenant_plan_assignments (effective_from, id) WHERE state = 'scheduled';

CREATE OR REPLACE FUNCTION app.apply_tenant_plan_assignment(p_assignment_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE assignment tenant_plan_assignments%ROWTYPE;
DECLARE policy plan_policy_versions%ROWTYPE;
DECLARE module_record record;
DECLARE entitlement_until timestamptz;
BEGIN
  SELECT * INTO assignment
  FROM tenant_plan_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant plan assignment was not found';
  END IF;
  IF assignment.state <> 'scheduled' THEN
    RETURN jsonb_build_object('assignmentId', assignment.id, 'state', assignment.state);
  END IF;
  IF assignment.effective_from > now() THEN
    RAISE EXCEPTION 'Tenant plan assignment is not due';
  END IF;

  SELECT * INTO policy
  FROM plan_policy_versions
  WHERE id = assignment.plan_policy_version_id
    AND plan_key = assignment.plan_key
    AND lifecycle = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active plan policy was not found for assignment';
  END IF;

  PERFORM set_config('app.allow_plan_baseline_write', 'true', true);
  DELETE FROM tenant_entitlements WHERE tenant_id = assignment.tenant_id;

  FOR module_record IN
    SELECT module_key, state, limits, trial_days
    FROM plan_policy_module_entitlements
    WHERE plan_policy_version_id = policy.id
  LOOP
    entitlement_until := CASE
      WHEN module_record.state = 'trial'
        THEN assignment.effective_from + (module_record.trial_days * interval '1 day')
      ELSE policy.effective_until
    END;
    INSERT INTO tenant_entitlements (
      tenant_id, module_key, state, limits, valid_from, valid_until
    ) VALUES (
      assignment.tenant_id, module_record.module_key, module_record.state,
      module_record.limits, assignment.effective_from, entitlement_until
    );
    INSERT INTO tenant_entitlement_history (
      tenant_id, module_key, source, previous_state, resulting_state,
      reason, effective_at, actor_id, correlation_id
    ) VALUES (
      assignment.tenant_id, module_record.module_key, 'plan', NULL,
      jsonb_build_object(
        'state', module_record.state,
        'limits', module_record.limits,
        'validFrom', assignment.effective_from,
        'validUntil', entitlement_until,
        'planKey', assignment.plan_key,
        'policyVersionId', policy.id
      ),
      assignment.reason, assignment.effective_from, p_actor_id, assignment.correlation_id
    );
  END LOOP;

  UPDATE tenants
     SET plan_key = assignment.plan_key,
         operational_version = operational_version + 1,
         updated_at = now()
   WHERE id = assignment.tenant_id;

  UPDATE tenant_plan_assignments
     SET state = 'applied', applied_by = p_actor_id,
         applied_at = now(), updated_at = now()
   WHERE id = assignment.id;

  INSERT INTO plan_change_history (
    plan_key, policy_version_id, event_type, reason,
    actor_id, correlation_id, evidence
  ) VALUES (
    assignment.plan_key, policy.id, 'tenant-assigned', assignment.reason,
    p_actor_id, assignment.correlation_id,
    jsonb_build_object('tenantId', assignment.tenant_id, 'assignmentId', assignment.id)
  );

  RETURN jsonb_build_object(
    'assignmentId', assignment.id,
    'tenantId', assignment.tenant_id,
    'planKey', assignment.plan_key,
    'state', 'applied'
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE tenant_plan_assignments
     SET state = 'failed', failure_reason = left(SQLERRM, 2000), updated_at = now()
   WHERE id = p_assignment_id AND state = 'scheduled';
  RAISE;
END
$$;

CREATE OR REPLACE FUNCTION app.apply_due_commercial_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE system_actor uuid;
DECLARE policy_record record;
DECLARE assignment_record record;
DECLARE policies_activated integer := 0;
DECLARE assignments_applied integer := 0;
BEGIN
  SELECT id INTO system_actor
  FROM users
  WHERE identity_issuer = 'https://control.veza.invalid/system'
    AND identity_subject = 'scheduled-jobs-bootstrap'
  LIMIT 1;
  IF system_actor IS NULL THEN
    RAISE EXCEPTION 'Scheduled-job system identity is unavailable';
  END IF;

  FOR policy_record IN
    SELECT id, version
    FROM plan_policy_versions
    WHERE lifecycle = 'scheduled' AND effective_from <= now()
    ORDER BY effective_from, id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE plan_policy_versions
       SET lifecycle = 'active', version = version + 1, updated_at = now()
     WHERE id = policy_record.id AND version = policy_record.version;
    IF FOUND THEN policies_activated := policies_activated + 1; END IF;
  END LOOP;

  FOR assignment_record IN
    SELECT id
    FROM tenant_plan_assignments
    WHERE state = 'scheduled' AND effective_from <= now()
    ORDER BY effective_from, id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM app.apply_tenant_plan_assignment(assignment_record.id, system_actor);
    assignments_applied := assignments_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'policiesActivated', policies_activated,
    'assignmentsApplied', assignments_applied
  );
END
$$;

REVOKE ALL ON tenant_plan_assignments FROM PUBLIC, veza_app, veza_worker;
GRANT SELECT, INSERT, UPDATE ON tenant_plan_assignments TO veza_control;
GRANT SELECT ON tenant_plan_assignments TO veza_worker;
REVOKE ALL ON FUNCTION app.apply_tenant_plan_assignment(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.apply_due_commercial_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_tenant_plan_assignment(uuid,uuid) TO veza_control, veza_worker;
GRANT EXECUTE ON FUNCTION app.apply_due_commercial_policy() TO veza_worker, veza_control;

INSERT INTO scheduled_jobs (
  tenant_id, job_key, handler_key, payload, interval_seconds,
  next_run_at, status, maximum_attempts, created_by
)
SELECT
  NULL, 'commercial.effective-date-sweep', 'commercial.effective-date-sweep',
  '{}'::jsonb, 60, now(), 'active', 8, bootstrap_user.id
FROM users bootstrap_user
WHERE bootstrap_user.identity_issuer = 'https://control.veza.invalid/system'
  AND bootstrap_user.identity_subject = 'scheduled-jobs-bootstrap'
ON CONFLICT (tenant_id, job_key) DO UPDATE
SET handler_key = EXCLUDED.handler_key,
    interval_seconds = EXCLUDED.interval_seconds,
    status = 'active',
    updated_at = now(),
    version = scheduled_jobs.version + 1;

COMMIT;
