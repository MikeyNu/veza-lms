CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP INDEX IF EXISTS role_assignments_unique_assignment_idx;

ALTER TABLE role_assignments
  ADD COLUMN ended_by uuid REFERENCES users(id),
  ADD COLUMN ended_at timestamptz,
  ADD COLUMN end_reason text,
  ADD CONSTRAINT role_assignments_end_evidence_check CHECK (
    (ended_at IS NULL AND ended_by IS NULL AND end_reason IS NULL)
    OR
    (ended_at IS NOT NULL AND ended_by IS NOT NULL AND end_reason IS NOT NULL AND length(btrim(end_reason)) BETWEEN 3 AND 500)
  ),
  ADD CONSTRAINT role_assignments_end_matches_validity_check CHECK (
    ended_at IS NULL OR valid_until = ended_at
  );

ALTER TABLE role_assignments
  ADD CONSTRAINT role_assignments_no_overlapping_grant
  EXCLUDE USING gist (
    tenant_id WITH =,
    membership_id WITH =,
    role_key WITH =,
    scope_type WITH =,
    scope_id WITH =,
    tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
  );

CREATE INDEX role_assignments_active_scope_idx
  ON role_assignments (tenant_id, scope_type, scope_id, role_key, membership_id)
  WHERE valid_until IS NULL;

CREATE INDEX membership_invitations_status_expiry_idx
  ON membership_invitations (tenant_id, status, expires_at, created_at DESC);

COMMENT ON CONSTRAINT role_assignments_no_overlapping_grant ON role_assignments IS
  'Preserves effective-dated role history while rejecting overlapping grants for the same role and scope.';
COMMENT ON COLUMN role_assignments.end_reason IS
  'Required operator-supplied reason when an assignment is ended before its original validity boundary.';
