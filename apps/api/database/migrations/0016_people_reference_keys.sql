BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS people_tenant_reference_uq
  ON people (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS person_relationships_tenant_reference_uq
  ON person_relationships (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS membership_invitations_tenant_reference_uq
  ON membership_invitations (tenant_id, id);

COMMIT;
