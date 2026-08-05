BEGIN;

CREATE TABLE platform_security_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_incident_id uuid NOT NULL REFERENCES platform_security_incidents(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('reported','assigned','contained','resolved','closed','evidence-added')),
  from_state text,
  to_state text,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  actor_id uuid NOT NULL REFERENCES users(id),
  correlation_id text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_security_incident_events_incident_time_idx
  ON platform_security_incident_events (security_incident_id, occurred_at DESC, id DESC);

INSERT INTO platform_security_incident_events (
  security_incident_id, event_type, from_state, to_state,
  reason, actor_id, correlation_id, evidence, occurred_at
)
SELECT
  incident.id, 'reported', NULL, 'open', incident.summary,
  incident.reported_by, incident.correlation_id, incident.evidence, incident.reported_at
FROM platform_security_incidents incident
WHERE NOT EXISTS (
  SELECT 1 FROM platform_security_incident_events event
  WHERE event.security_incident_id = incident.id AND event.event_type = 'reported'
);

CREATE OR REPLACE FUNCTION app.capture_implicit_support_termination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE system_actor uuid;
DECLARE event_reason text;
BEGIN
  IF OLD.state = 'active' AND NEW.state = 'terminated' THEN
    IF NEW.termination_reason = 'Customer approval was revoked'
       OR EXISTS (
         SELECT 1 FROM support_cases case_record
         WHERE case_record.id = NEW.support_case_id AND case_record.state = 'resolved'
       ) THEN
      SELECT id INTO system_actor
      FROM users
      WHERE identity_issuer = 'https://control.veza.invalid/system'
        AND identity_subject = 'scheduled-jobs-bootstrap'
      LIMIT 1;
      IF system_actor IS NULL THEN
        RAISE EXCEPTION 'Scheduled-job system identity is unavailable';
      END IF;
      event_reason := COALESCE(NULLIF(btrim(NEW.termination_reason), ''), 'Support case was resolved');
      INSERT INTO support_session_events (
        support_session_id, event_type, actor_id, resource_type,
        resource_id, purpose, correlation_id, evidence
      ) VALUES (
        NEW.id, 'terminated', system_actor, 'support-session',
        NEW.id::text, event_reason, NEW.correlation_id,
        jsonb_build_object(
          'supportCaseId', NEW.support_case_id,
          'tenantId', NEW.tenant_id,
          'operatorId', NEW.operator_id,
          'terminationSource', CASE
            WHEN NEW.termination_reason = 'Customer approval was revoked' THEN 'customer-revocation'
            ELSE 'case-resolution'
          END
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS support_implicit_termination_evidence ON support_elevation_sessions;
CREATE TRIGGER support_implicit_termination_evidence
AFTER UPDATE OF state, termination_reason ON support_elevation_sessions
FOR EACH ROW EXECUTE FUNCTION app.capture_implicit_support_termination();

REVOKE ALL ON platform_security_incident_events FROM PUBLIC, veza_app, veza_worker;
GRANT SELECT, INSERT ON platform_security_incident_events TO veza_control;
REVOKE ALL ON FUNCTION app.capture_implicit_support_termination() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.capture_implicit_support_termination() TO veza_control;

COMMIT;
