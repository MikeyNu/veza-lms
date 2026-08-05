BEGIN;

CREATE OR REPLACE FUNCTION app.record_initial_enrolment_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  configured_correlation text;
BEGIN
  configured_correlation := current_setting('app.correlation_id', true);
  INSERT INTO enrolment_transitions (
    id,tenant_id,institution_id,enrolment_id,from_status,to_status,reason,actor_id,correlation_id
  ) VALUES (
    gen_random_uuid(),NEW.tenant_id,NEW.institution_id,NEW.id,NULL,NEW.status,
    CASE NEW.source
      WHEN 'transfer' THEN 'Created as the destination record for an approved enrolment transfer'
      WHEN 'import' THEN 'Created from a reconciled institutional import'
      WHEN 'integration' THEN 'Created through an authorised integration'
      ELSE 'Created through the institution enrolment workflow'
    END,
    NEW.created_by,
    COALESCE(NULLIF(configured_correlation, ''), 'database:' || txid_current()::text)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrolments_initial_transition
AFTER INSERT ON enrolments
FOR EACH ROW EXECUTE FUNCTION app.record_initial_enrolment_transition();

COMMIT;
