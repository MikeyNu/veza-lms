BEGIN;

ALTER TABLE person_contact_points
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE person_addresses
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE person_identifiers
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE person_organisational_assignments
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE person_consents
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE person_disclosure_restrictions
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE staff_engagements (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  organisational_unit_id uuid,
  engagement_type text NOT NULL CHECK (engagement_type IN ('employee','contractor','volunteer','external')),
  employee_number text,
  title text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','on_leave','ended','cancelled')),
  started_on date NOT NULL,
  ended_on date,
  reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, person_id) REFERENCES people(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, institution_id, organisational_unit_id)
    REFERENCES organisational_units(tenant_id, institution_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id),
  CHECK (employee_number IS NULL OR length(btrim(employee_number)) BETWEEN 1 AND 80),
  CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 160),
  CHECK (ended_on IS NULL OR ended_on >= started_on),
  CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 10 AND 1000)
);
CREATE UNIQUE INDEX staff_engagements_active_employee_number_uq
  ON staff_engagements (tenant_id, institution_id, lower(employee_number))
  WHERE employee_number IS NOT NULL AND status IN ('planned','active','on_leave');
CREATE INDEX staff_engagements_person_history_idx
  ON staff_engagements (tenant_id, person_id, started_on DESC, created_at DESC);

CREATE TABLE person_identity_link_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  membership_invitation_id uuid,
  requested_email citext,
  requested_role_key text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','cancelled','expired','failed')),
  linked_user_id uuid REFERENCES users(id),
  expires_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, person_id) REFERENCES people(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, membership_invitation_id)
    REFERENCES membership_invitations(tenant_id, id) ON DELETE SET NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, membership_invitation_id),
  CHECK (requested_email IS NOT NULL OR linked_user_id IS NOT NULL),
  CHECK (requested_role_key IS NULL OR requested_role_key IN (
    'tenant-owner','institution-admin','registrar','curriculum-manager','course-manager',
    'instructor','assessor','moderator','learner','guardian-sponsor','auditor','support-agent'
  )),
  CHECK (failure_reason IS NULL OR length(btrim(failure_reason)) BETWEEN 10 AND 1000),
  CHECK ((status = 'linked') = (linked_user_id IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX person_identity_link_requests_one_open_person_idx
  ON person_identity_link_requests (tenant_id, person_id)
  WHERE status = 'pending';
CREATE INDEX person_identity_link_requests_invitation_idx
  ON person_identity_link_requests (tenant_id, membership_invitation_id, status);

CREATE TABLE person_relationship_invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  relationship_id uuid NOT NULL,
  identity_link_request_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','accepted','revoked','expired','failed')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, relationship_id) REFERENCES person_relationships(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, identity_link_request_id) REFERENCES person_identity_link_requests(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, relationship_id),
  UNIQUE (tenant_id, identity_link_request_id)
);

CREATE TABLE person_data_subject_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('access','export')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','ready','delivered','rejected','cancelled')),
  reason text NOT NULL,
  export_format text CHECK (export_format IS NULL OR export_format IN ('json')),
  export_snapshot jsonb,
  export_checksum text,
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  delivered_at timestamptz,
  completed_by uuid REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  FOREIGN KEY (tenant_id, person_id) REFERENCES people(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id),
  CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  CHECK (export_snapshot IS NULL OR (jsonb_typeof(export_snapshot) = 'object' AND octet_length(export_snapshot::text) <= 1048576)),
  CHECK (export_checksum IS NULL OR export_checksum ~ '^[a-f0-9]{64}$'),
  CHECK (status <> 'ready' OR (export_snapshot IS NOT NULL AND export_checksum IS NOT NULL AND ready_at IS NOT NULL))
);
CREATE INDEX person_data_subject_requests_person_idx
  ON person_data_subject_requests (tenant_id, person_id, requested_at DESC);

ALTER TABLE people_import_rows
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS reconciliation_action text CHECK (
    reconciliation_action IS NULL OR reconciliation_action IN ('corrected','link-existing','create-new','skip')
  ),
  ADD COLUMN IF NOT EXISTS reconciliation_reason text,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE people_import_rows
  ADD CONSTRAINT people_import_rows_reconciliation_reason_check
  CHECK (reconciliation_reason IS NULL OR length(btrim(reconciliation_reason)) BETWEEN 10 AND 1000);

ALTER TABLE staff_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_engagements FORCE ROW LEVEL SECURITY;
ALTER TABLE person_identity_link_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_identity_link_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE person_relationship_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_relationship_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE person_data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_data_subject_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY staff_engagements_tenant_isolation ON staff_engagements
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY person_identity_link_requests_tenant_isolation ON person_identity_link_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY person_relationship_invitations_tenant_isolation ON person_relationship_invitations
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY person_data_subject_requests_tenant_isolation ON person_data_subject_requests
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON
  staff_engagements,
  person_identity_link_requests,
  person_relationship_invitations,
  person_data_subject_requests
TO veza_app;
GRANT SELECT, UPDATE ON people, person_identity_link_requests, person_relationship_invitations
TO veza_control;

COMMIT;
