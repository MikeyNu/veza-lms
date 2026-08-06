BEGIN;

ALTER TABLE membership_invitations
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

COMMENT ON COLUMN membership_invitations.version IS
  'Monotonic aggregate version used by invitation lifecycle audit and outbox evidence.';

COMMIT;
