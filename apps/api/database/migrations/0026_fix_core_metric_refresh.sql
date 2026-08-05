BEGIN;

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

  SELECT COALESCE(max(updated_at),measured),count(*) INTO source_time,metric_value
  FROM enrolments WHERE tenant_id=p_tenant_id AND institution_id=p_institution_id
    AND effective_until IS NULL AND status IN ('active','pending');
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='enrolment.active';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,source_time,jsonb_build_object('institutionId',p_institution_id,'status',ARRAY['active','pending']));

  SELECT COALESCE(max(e.occurred_at),measured) INTO source_time
  FROM learner_completion_evidence e JOIN enrolments n ON n.id=e.enrolment_id
  WHERE e.tenant_id=p_tenant_id AND n.institution_id=p_institution_id;
  SELECT CASE WHEN count(*)=0 THEN 0 ELSE 100.0*count(*) FILTER (WHERE e.id IS NOT NULL)/count(*) END INTO metric_value
  FROM enrolments n
  JOIN studio_course_spaces cs ON cs.institution_id=p_institution_id
  JOIN studio_publication_snapshots s ON s.course_space_id=cs.id AND s.status='current'
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.manifest->'lessons','[]'::jsonb)) lesson
  LEFT JOIN learner_completion_evidence e ON e.enrolment_id=n.id
    AND e.lesson_id=(lesson->>'lessonId')::uuid AND e.evidence_type='lesson-completed'
  WHERE n.tenant_id=p_tenant_id AND n.institution_id=p_institution_id
    AND n.status='active' AND n.effective_until IS NULL;
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='learning.completion-rate';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,COALESCE(source_time,measured),jsonb_build_object('institutionId',p_institution_id));

  SELECT COALESCE(max(s.created_at),measured) INTO source_time FROM submission_attempts s
  WHERE s.tenant_id=p_tenant_id AND s.institution_id=p_institution_id;
  SELECT CASE WHEN count(DISTINCT a.id)=0 THEN 0 ELSE 100.0*count(DISTINCT s.assignment_id)/count(DISTINCT a.id) END INTO metric_value
  FROM assignments a LEFT JOIN submission_attempts s ON s.assignment_id=a.id AND s.status IN ('submitted','accepted')
  WHERE a.tenant_id=p_tenant_id AND a.institution_id=p_institution_id AND a.status IN ('published','closed');
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='assessment.submission-rate';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,COALESCE(source_time,measured),jsonb_build_object('institutionId',p_institution_id));

  SELECT COALESCE(max(r.created_at),measured),count(*) INTO source_time,metric_value
  FROM learner_grade_results r JOIN enrolments e ON e.id=r.enrolment_id
  WHERE r.tenant_id=p_tenant_id AND e.institution_id=p_institution_id AND r.state='published';
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='results.published';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,COALESCE(source_time,measured),jsonb_build_object('institutionId',p_institution_id,'state','published'));

  SELECT COALESCE(max(issued_at),measured),count(*) INTO source_time,metric_value
  FROM issued_certificates WHERE tenant_id=p_tenant_id AND institution_id=p_institution_id AND status='issued';
  SELECT id INTO definition_id FROM metric_definitions WHERE tenant_id=p_tenant_id AND metric_key='credentials.issued';
  INSERT INTO metric_snapshots(id,tenant_id,institution_id,metric_definition_id,dimension_key,dimension_value,metric_value,measured_at,source_max_occurred_at,drillthrough_filter)
  VALUES(gen_random_uuid(),p_tenant_id,p_institution_id,definition_id,'institution',p_institution_id::text,COALESCE(metric_value,0),measured,COALESCE(source_time,measured),jsonb_build_object('institutionId',p_institution_id,'status','issued'));
END $$;

REVOKE ALL ON FUNCTION app.refresh_core_metrics(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_core_metrics(uuid,uuid) TO veza_app;

COMMIT;
