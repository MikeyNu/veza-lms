BEGIN;

ALTER TABLE rubrics
  DROP CONSTRAINT IF EXISTS rubrics_status_check,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT rubrics_status_check CHECK (status IN ('draft','in_review','approved','retired')),
  ADD CONSTRAINT rubrics_review_evidence_check CHECK (
    status NOT IN ('in_review','approved') OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)
  ),
  ADD CONSTRAINT rubrics_approval_segregation_check CHECK (
    status <> 'approved' OR (
      approved_by IS NOT NULL AND approved_at IS NOT NULL AND submitted_by IS NOT NULL
      AND approved_by <> created_by AND approved_by <> submitted_by
    )
  ),
  ADD CONSTRAINT rubrics_approval_notes_check CHECK (
    approval_notes IS NULL OR length(btrim(approval_notes)) BETWEEN 10 AND 2000
  );

UPDATE rubrics SET updated_by=created_by WHERE updated_by IS NULL;
ALTER TABLE rubrics ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE certificate_templates
  DROP CONSTRAINT IF EXISTS certificate_templates_status_check,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT certificate_templates_status_check CHECK (status IN ('draft','in_review','approved','retired')),
  ADD CONSTRAINT certificate_templates_review_evidence_check CHECK (
    status NOT IN ('in_review','approved') OR (submitted_by IS NOT NULL AND submitted_at IS NOT NULL)
  ),
  ADD CONSTRAINT certificate_templates_approval_segregation_check CHECK (
    status <> 'approved' OR (
      approved_by IS NOT NULL AND approved_at IS NOT NULL AND submitted_by IS NOT NULL
      AND approved_by <> created_by AND approved_by <> submitted_by
    )
  ),
  ADD CONSTRAINT certificate_templates_approval_notes_check CHECK (
    approval_notes IS NULL OR length(btrim(approval_notes)) BETWEEN 10 AND 2000
  );

UPDATE certificate_templates SET updated_by=created_by WHERE updated_by IS NULL;
ALTER TABLE certificate_templates ALTER COLUMN updated_by SET NOT NULL;

ALTER TABLE certificate_award_rules
  DROP CONSTRAINT IF EXISTS certificate_award_rules_status_check,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version>0),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT certificate_award_rules_status_check CHECK (status IN ('draft','active','retired'));

CREATE TABLE award_rule_evaluations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  award_rule_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  enrolment_id uuid,
  eligible boolean NOT NULL,
  findings jsonb NOT NULL CHECK (jsonb_typeof(findings)='array'),
  evidence_snapshot jsonb NOT NULL CHECK (jsonb_typeof(evidence_snapshot)='object'),
  evidence_checksum text NOT NULL CHECK (evidence_checksum ~ '^[a-f0-9]{64}$'),
  evaluated_by uuid NOT NULL REFERENCES users(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  FOREIGN KEY (tenant_id,award_rule_id) REFERENCES certificate_award_rules(tenant_id,id),
  FOREIGN KEY (tenant_id,learner_person_id) REFERENCES people(tenant_id,id),
  FOREIGN KEY (tenant_id,enrolment_id) REFERENCES enrolments(tenant_id,id)
);
CREATE INDEX award_rule_evaluations_lookup_idx
  ON award_rule_evaluations(tenant_id,award_rule_id,learner_person_id,evaluated_at DESC);

ALTER TABLE issued_certificates
  ADD COLUMN IF NOT EXISTS award_evaluation_id uuid,
  ADD CONSTRAINT issued_certificates_award_evaluation_fk
    FOREIGN KEY (tenant_id,award_evaluation_id) REFERENCES award_rule_evaluations(tenant_id,id);

ALTER TABLE submission_marks
  ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS release_reason text,
  ADD CONSTRAINT submission_marks_release_evidence_check CHECK (
    status <> 'released' OR (
      released_at IS NOT NULL AND released_by IS NOT NULL
      AND release_reason IS NOT NULL AND length(btrim(release_reason)) BETWEEN 10 AND 1000
    )
  );

CREATE TABLE metric_refresh_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metric_count integer NOT NULL DEFAULT 0 CHECK (metric_count>=0),
  error_message text,
  worker_id text NOT NULL CHECK (length(worker_id) BETWEEN 3 AND 160),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,institution_id) REFERENCES institutions(tenant_id,id),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR error_message IS NOT NULL)
);
CREATE INDEX metric_refresh_runs_recent_idx
  ON metric_refresh_runs(tenant_id,institution_id,started_at DESC);

ALTER TABLE award_rule_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_rule_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY award_rule_evaluations_tenant_isolation ON award_rule_evaluations
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
GRANT SELECT,INSERT ON award_rule_evaluations TO veza_app;

ALTER TABLE metric_refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_refresh_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY metric_refresh_runs_tenant_isolation ON metric_refresh_runs
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
GRANT SELECT ON metric_refresh_runs TO veza_app;
GRANT SELECT,INSERT,UPDATE ON metric_refresh_runs TO veza_worker;

CREATE OR REPLACE FUNCTION app.protect_reviewed_rubric()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('in_review','approved','retired') AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.institution_id IS DISTINCT FROM OLD.institution_id
  ) THEN
    RAISE EXCEPTION 'reviewed rubrics are immutable; create a new rubric version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rubrics_reviewed_immutable
BEFORE UPDATE ON rubrics FOR EACH ROW EXECUTE FUNCTION app.protect_reviewed_rubric();

CREATE OR REPLACE FUNCTION app.protect_reviewed_rubric_criteria()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lifecycle text;
BEGIN
  SELECT status INTO lifecycle FROM rubrics
  WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id)
    AND id=COALESCE(NEW.rubric_id,OLD.rubric_id);
  IF lifecycle IN ('in_review','approved','retired') THEN
    RAISE EXCEPTION 'rubric criteria are immutable after review submission';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER rubric_criteria_reviewed_immutable
BEFORE INSERT OR UPDATE OR DELETE ON rubric_criteria
FOR EACH ROW EXECUTE FUNCTION app.protect_reviewed_rubric_criteria();

CREATE OR REPLACE FUNCTION app.protect_reviewed_certificate_template()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('in_review','approved','retired') AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.document_schema IS DISTINCT FROM OLD.document_schema OR
    NEW.institution_id IS DISTINCT FROM OLD.institution_id
  ) THEN
    RAISE EXCEPTION 'reviewed certificate templates are immutable; create a new template version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER certificate_templates_reviewed_immutable
BEFORE UPDATE ON certificate_templates
FOR EACH ROW EXECUTE FUNCTION app.protect_reviewed_certificate_template();

CREATE OR REPLACE FUNCTION app.require_owned_enrolment(p_enrolment_id uuid,p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE learner_id uuid;
BEGIN
  SELECT e.learner_person_id INTO learner_id
  FROM enrolments e
  JOIN people p ON p.tenant_id=e.tenant_id AND p.id=e.learner_person_id
  WHERE e.tenant_id=app.current_tenant_id()
    AND e.id=p_enrolment_id
    AND p.linked_user_id=p_actor_id
    AND p.status='active';
  IF learner_id IS NULL THEN
    RAISE EXCEPTION 'submission enrolment does not belong to the authenticated learner'
      USING ERRCODE='42501';
  END IF;
  RETURN learner_id;
END $$;

CREATE OR REPLACE FUNCTION app.require_owned_submission_attempt(p_attempt_id uuid,p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE learner_id uuid;
BEGIN
  SELECT s.learner_person_id INTO learner_id
  FROM submission_attempts s
  JOIN people p ON p.tenant_id=s.tenant_id AND p.id=s.learner_person_id
  WHERE s.tenant_id=app.current_tenant_id()
    AND s.id=p_attempt_id
    AND p.linked_user_id=p_actor_id
    AND p.status='active';
  IF learner_id IS NULL THEN
    RAISE EXCEPTION 'submission attempt does not belong to the authenticated learner'
      USING ERRCODE='42501';
  END IF;
  RETURN learner_id;
END $$;

CREATE OR REPLACE FUNCTION app.require_owned_submission_file(p_file_id uuid,p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE attempt_id uuid;
BEGIN
  SELECT f.submission_attempt_id INTO attempt_id
  FROM submission_files f
  JOIN submission_attempts s ON s.tenant_id=f.tenant_id AND s.id=f.submission_attempt_id
  JOIN people p ON p.tenant_id=s.tenant_id AND p.id=s.learner_person_id
  WHERE f.tenant_id=app.current_tenant_id()
    AND f.id=p_file_id
    AND p.linked_user_id=p_actor_id
    AND p.status='active';
  IF attempt_id IS NULL THEN
    RAISE EXCEPTION 'submission file does not belong to the authenticated learner'
      USING ERRCODE='42501';
  END IF;
  RETURN attempt_id;
END $$;

REVOKE ALL ON FUNCTION app.require_owned_enrolment(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.require_owned_submission_attempt(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.require_owned_submission_file(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_owned_enrolment(uuid,uuid) TO veza_app;
GRANT EXECUTE ON FUNCTION app.require_owned_submission_attempt(uuid,uuid) TO veza_app;
GRANT EXECUTE ON FUNCTION app.require_owned_submission_file(uuid,uuid) TO veza_app;

CREATE OR REPLACE FUNCTION app.refresh_due_core_metrics(p_worker_id text,p_limit integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target record;
DECLARE run_id uuid;
DECLARE refreshed integer := 0;
BEGIN
  IF length(btrim(p_worker_id)) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'worker identifier is invalid';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'refresh target limit is invalid';
  END IF;

  FOR target IN
    SELECT i.tenant_id,i.id institution_id
    FROM institutions i
    LEFT JOIN LATERAL (
      SELECT max(s.measured_at) measured_at
      FROM metric_snapshots s
      WHERE s.tenant_id=i.tenant_id AND s.institution_id=i.id
    ) latest ON true
    WHERE i.status='active'
      AND (latest.measured_at IS NULL OR latest.measured_at < now()-interval '15 minutes')
    ORDER BY latest.measured_at NULLS FIRST,i.created_at
    LIMIT p_limit
    FOR UPDATE OF i SKIP LOCKED
  LOOP
    run_id:=gen_random_uuid();
    INSERT INTO metric_refresh_runs(id,tenant_id,institution_id,status,worker_id)
    VALUES(run_id,target.tenant_id,target.institution_id,'running',p_worker_id);
    BEGIN
      PERFORM set_config('app.tenant_id',target.tenant_id::text,true);
      PERFORM app.refresh_core_metrics(target.tenant_id,target.institution_id);
      UPDATE metric_refresh_runs SET status='completed',completed_at=now(),metric_count=5
      WHERE id=run_id;
      refreshed:=refreshed+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE metric_refresh_runs SET status='failed',completed_at=now(),error_message=left(SQLERRM,1000)
      WHERE id=run_id;
    END;
  END LOOP;
  RETURN refreshed;
END $$;
REVOKE ALL ON FUNCTION app.refresh_due_core_metrics(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_due_core_metrics(text,integer) TO veza_worker;

COMMIT;
