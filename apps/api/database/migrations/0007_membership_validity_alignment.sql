CREATE OR REPLACE FUNCTION app.align_membership_validity_with_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    NEW.valid_until := NULL;
  ELSIF NEW.status = 'revoked' AND NEW.valid_until IS NULL THEN
    NEW.valid_until := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER align_membership_validity_with_status_trigger
BEFORE INSERT OR UPDATE OF status, valid_until
ON memberships
FOR EACH ROW EXECUTE FUNCTION app.align_membership_validity_with_status();

COMMENT ON FUNCTION app.align_membership_validity_with_status() IS
  'Keeps active memberships open-ended and records a terminal validity boundary for revoked memberships.';
