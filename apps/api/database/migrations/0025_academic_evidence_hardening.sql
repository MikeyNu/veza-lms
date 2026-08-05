BEGIN;

GRANT SELECT (verification_code,status,issued_at,revocation_reason,payload)
  ON issued_certificates TO veza_control;

CREATE TABLE assignment_groups (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','archived')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,assignment_id,name),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES assignments(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE assignment_group_members (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_group_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (tenant_id,assignment_group_id,learner_person_id,joined_at),
  FOREIGN KEY (tenant_id,assignment_group_id) REFERENCES assignment_groups(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,learner_person_id) REFERENCES people(tenant_id,id),
  CHECK (left_at IS NULL OR left_at > joined_at)
);
CREATE UNIQUE INDEX assignment_group_member_current_uq
  ON assignment_group_members(tenant_id,assignment_group_id,learner_person_id)
  WHERE left_at IS NULL;

ALTER TABLE submission_attempts ADD COLUMN assignment_group_id uuid;
ALTER TABLE submission_attempts ADD CONSTRAINT submission_attempt_group_fk
  FOREIGN KEY (tenant_id,assignment_group_id) REFERENCES assignment_groups(tenant_id,id);

ALTER TABLE assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_group_members FORCE ROW LEVEL SECURITY;
CREATE POLICY assignment_groups_tenant_isolation ON assignment_groups
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
CREATE POLICY assignment_group_members_tenant_isolation ON assignment_group_members
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
GRANT SELECT,INSERT,UPDATE ON assignment_groups,assignment_group_members TO veza_app;

CREATE OR REPLACE FUNCTION app.protect_published_grade_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='published' AND (
    NEW.enrolment_id IS DISTINCT FROM OLD.enrolment_id OR
    NEW.gradebook_item_id IS DISTINCT FROM OLD.gradebook_item_id OR
    NEW.raw_score IS DISTINCT FROM OLD.raw_score OR
    NEW.calculated_score IS DISTINCT FROM OLD.calculated_score OR
    NEW.override_score IS DISTINCT FROM OLD.override_score OR
    NEW.override_reason IS DISTINCT FROM OLD.override_reason OR
    NEW.is_missing IS DISTINCT FROM OLD.is_missing OR
    NEW.is_excluded IS DISTINCT FROM OLD.is_excluded OR
    NEW.is_exempt IS DISTINCT FROM OLD.is_exempt
  ) THEN
    RAISE EXCEPTION 'published results must be corrected by a superseding record';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER learner_grade_results_published_immutable
BEFORE UPDATE ON learner_grade_results
FOR EACH ROW EXECUTE FUNCTION app.protect_published_grade_result();

CREATE OR REPLACE FUNCTION app.refresh_core_metrics(p_tenant_id uuid,p_institution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  definition_id uuid;
  measured timestamptz := now();
  source_time timestamptz;
  metric_value numeric;
BEGIN
  IF p_tenant_id IS NULL OR p_institution_id IS NULL THEN RAISE EXCEPTION 'tenant and institution are required'; END IF;

  INSERT INTO metric_definitions(id,tenant_id,metric_key,title,description,unit,calculation_schema,freshness_target_seconds)
  VALUES
    (gen_random_uuid(),p_tenant_id,'enrolment.active','Active enrolments','Current effective enrolments in active learning states.','learners','{"source":"enrolments","statuses":["active","pending"]}',3600),
    (gen_random_uuid(),p_tenant_id,'learning.completion-rate','Lesson completion rate','Completed published lessons divided by available published lessons for active enrolments.','percent','{"source":"learner_completion_evidence"}',3600),
    (gen_random_uuid(),p_tenant_id,'assessment.submission-rate','Assignment submission rate','Submitted or accepted attempts divided by published assignment opportunities.','percent','{"source":"submission_attempts"}',3600),
    (gen_random_uuid(),p_tenant_id,'results.published','Published results','Current published grade results for the institution.','results','{"source":"learner_grade_results"}',3600),
    (gen_random_uuid(),p_tenant_id,'credentials.issued','Active credentials','Issued credentials that have not been revoked or superseded.','credentials','{"source":"issued_certificates"}',86400)
  ON CONFLICT (tenant_id,metric_key) DO NOTHING;

  SELECT COALESCE(max(updated_at),measured) INTO source_time FROM enrolments WHERE tenant_id=p_tenant_id AND institution_id=p_institution_id;
  SELECT count(*) INTO metric_value FROM enrolments WHERE tenant_id=p_tenant_id AND institution_id=p_institution_id AND effective_until IS NULL AND status IN ('active','pending');
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='enrolment.active';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,metric_value,measured,source_time,jsonb_build_object('institutionId',p_institution_id,'status',ARRAY['active','pending']));

  SELECT COALESCE(max(e.occurred_at),measured) INTO source_time FROM learner_completion_evidence e JOIN enrolments n ON n.id=e.enrolment_id WHERE e.tenant_id=p_tenant_id AND n.institution_id=p_institution_id;
  SELECT CASE WHEN count(*)=0 THEN 0 ELSE 100.0*count(*) FILTER (WHERE e.id IS NOT NULL)/count(*) END INTO metric_value
  FROM enrolments n JOIN studio_publication_snapshots s ON s.course_space_id IN (SELECT id FROM studio_course_spaces WHERE institution_id=p_institution_id)
  CROSS JOIN LATERAL jsonb_array_elements(s.manifest->'lessons') lesson
  LEFT JOIN learner_completion_evidence e ON e.enrolment_id=n.id AND e.lesson_id=(lesson->>'lessonId')::uuid AND e.evidence_type='lesson-completed'
  WHERE n.tenant_id=p_tenant_id AND n.institution_id=p_institution_id AND n.status='active' AND n.effective_until IS NULL AND s.status='current';
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='learning.completion-rate';
  INSERT INTO metric_snapshots VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,source_time,jsonb_build_object('institutionId',p_institution_id),DEFAULT);

  SELECT COALESCE(max(s.created_at),measured) INTO source_time FROM submission_attempts s WHERE s.tenant_id=p_tenant_id AND s.institution_id=p_institution_id;
  SELECT CASE WHEN count(DISTINCT a.id)=0 THEN 0 ELSE 100.0*count(DISTINCT s.assignment_id)/count(DISTINCT a.id) END INTO metric_value
  FROM assignments a LEFT JOIN submission_attempts s ON s.assignment_id=a.id AND s.status IN ('submitted','accepted')
  WHERE a.tenant_id=p_tenant_id AND a.institution_id=p_institution_id AND a.status IN ('published','closed');
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='assessment.submission-rate';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,source_time,jsonb_build_object('institutionId',p_institution_id));

  SELECT COALESCE(max(r.created_at),measured),count(*) INTO source_time,metric_value FROM learner_grade_results r JOIN enrolments e ON e.id=r.enrolment_id WHERE r.tenant_id=p_tenant_id AND e.institution_id=p_institution_id AND r.state='published';
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='results.published';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,metric_value,measured,source_time,jsonb_build_object('institutionId',p_institution_id,'state','published'));

  SELECT COALESCE(max(issued_at),measured),count(*) INTO source_time,metric_value FROM issued_certificates WHERE tenant_id=p_tenant_id AND institution_id=p_institution_id AND status='issued';
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='credentials.issued';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,metric_value,measured,source_time,jsonb_build_object('institutionId',p_institution_id,'status','issued'));
END $$;
REVOKE ALL ON FUNCTION app.refresh_core_metrics(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_core_metrics(uuid,uuid) TO veza_app;

COMMIT;
