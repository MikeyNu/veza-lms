BEGIN;

ALTER TABLE export_jobs DROP CONSTRAINT export_jobs_format_check;
ALTER TABLE export_jobs
  ADD CONSTRAINT export_jobs_format_check CHECK (format IN ('csv','json','pdf')),
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN maximum_attempts integer NOT NULL DEFAULT 5 CHECK (maximum_attempts BETWEEN 1 AND 20),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN leased_at timestamptz,
  ADD COLUMN lease_owner text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE export_jobs
  ADD CONSTRAINT export_jobs_ready_evidence_check CHECK (
    status <> 'ready' OR (
      object_key IS NOT NULL AND checksum IS NOT NULL AND row_count IS NOT NULL
      AND ready_at IS NOT NULL AND expires_at IS NOT NULL
    )
  ),
  ADD CONSTRAINT export_jobs_failed_evidence_check CHECK (
    status <> 'failed' OR failure_reason IS NOT NULL
  );

CREATE INDEX export_jobs_worker_queue_idx
  ON export_jobs (next_attempt_at, requested_at, id)
  WHERE status IN ('requested','processing');

CREATE OR REPLACE FUNCTION app.claim_export_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  export_type text,
  format text,
  attempts integer,
  maximum_attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT job.id
    FROM export_jobs job
    WHERE (
        job.status = 'requested' AND job.next_attempt_at <= now()
      ) OR (
        job.status = 'processing'
        AND job.leased_at < now() - make_interval(secs => greatest(30,p_lease_seconds))
      )
    ORDER BY job.next_attempt_at, job.requested_at, job.id
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1,least(100,p_limit))
  )
  UPDATE export_jobs job
  SET status = 'processing',
      attempts = job.attempts + 1,
      leased_at = now(),
      lease_owner = p_worker_id,
      failure_reason = NULL,
      updated_at = now()
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.id, job.tenant_id, job.export_type, job.format,
            job.attempts, job.maximum_attempts
$$;

CREATE OR REPLACE FUNCTION app.export_document_payload(p_export_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job export_jobs%ROWTYPE;
  tenant_name text;
  institution_name text;
  title_value text;
  columns_value jsonb;
  rows_value jsonb;
  learner_filter uuid;
  course_run_filter uuid;
BEGIN
  SELECT * INTO job FROM export_jobs WHERE id = p_export_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'export job was not found'; END IF;
  IF job.status <> 'processing' THEN RAISE EXCEPTION 'export job is not processing'; END IF;

  SELECT display_name INTO tenant_name FROM tenants WHERE id = job.tenant_id;
  IF job.institution_id IS NOT NULL THEN
    SELECT display_name INTO institution_name
    FROM institutions
    WHERE tenant_id = job.tenant_id AND id = job.institution_id;
  END IF;
  IF coalesce(job.filters->>'learnerPersonId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    learner_filter := (job.filters->>'learnerPersonId')::uuid;
  END IF;
  IF coalesce(job.filters->>'courseRunId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    course_run_filter := (job.filters->>'courseRunId')::uuid;
  END IF;

  IF job.export_type = 'people' THEN
    title_value := 'People directory export';
    columns_value := '["personId","preferredName","legalGivenNames","legalFamilyName","status","locale"]'::jsonb;
    SELECT coalesce(jsonb_agg(record ORDER BY record->>'legalFamilyName',record->>'legalGivenNames',record->>'personId'),'[]'::jsonb)
    INTO rows_value
    FROM (
      SELECT jsonb_build_object(
        'personId',person.id,
        'preferredName',person.preferred_name,
        'legalGivenNames',person.legal_given_names,
        'legalFamilyName',person.legal_family_name,
        'status',person.status,
        'locale',person.locale
      ) record
      FROM people person
      WHERE person.tenant_id = job.tenant_id
        AND person.status <> 'merged'
        AND (
          job.institution_id IS NULL
          OR EXISTS (
            SELECT 1 FROM learner_profiles learner
            WHERE learner.tenant_id=person.tenant_id AND learner.person_id=person.id
              AND learner.institution_id=job.institution_id
          )
          OR EXISTS (
            SELECT 1 FROM staff_profiles staff
            WHERE staff.tenant_id=person.tenant_id AND staff.person_id=person.id
              AND staff.institution_id=job.institution_id
          )
        )
      ORDER BY person.legal_family_name,person.legal_given_names,person.id
      LIMIT 10000
    ) records;
  ELSIF job.export_type = 'enrolments' THEN
    title_value := 'Enrolment export';
    columns_value := '["enrolmentId","learnerPersonId","learnerName","courseRunId","courseCode","courseTitle","status","enrolledOn","completionResult"]'::jsonb;
    SELECT coalesce(jsonb_agg(record ORDER BY record->>'learnerName',record->>'courseCode'),'[]'::jsonb)
    INTO rows_value
    FROM (
      SELECT jsonb_build_object(
        'enrolmentId',enrolment.id,
        'learnerPersonId',person.id,
        'learnerName',concat_ws(' ',coalesce(person.preferred_name,person.legal_given_names),person.legal_family_name),
        'courseRunId',run.id,
        'courseCode',run.code,
        'courseTitle',run.title,
        'status',enrolment.status,
        'enrolledOn',enrolment.enrolled_on,
        'completionResult',enrolment.completion_result
      ) record
      FROM enrolments enrolment
      JOIN people person ON person.tenant_id=enrolment.tenant_id AND person.id=enrolment.learner_person_id
      JOIN course_runs run ON run.tenant_id=enrolment.tenant_id AND run.id=enrolment.course_run_id
      WHERE enrolment.tenant_id=job.tenant_id
        AND (job.institution_id IS NULL OR enrolment.institution_id=job.institution_id)
        AND (learner_filter IS NULL OR enrolment.learner_person_id=learner_filter)
        AND (course_run_filter IS NULL OR enrolment.course_run_id=course_run_filter)
        AND (job.filters->>'status' IS NULL OR enrolment.status=job.filters->>'status')
      ORDER BY person.legal_family_name,person.legal_given_names,run.code,enrolment.id
      LIMIT 10000
    ) records;
  ELSIF job.export_type = 'gradebook' THEN
    title_value := 'Gradebook export';
    columns_value := '["resultId","learnerPersonId","learnerName","courseRunId","courseTitle","itemTitle","rawScore","calculatedScore","overrideScore","state","publishedAt"]'::jsonb;
    SELECT coalesce(jsonb_agg(record ORDER BY record->>'learnerName',record->>'itemTitle'),'[]'::jsonb)
    INTO rows_value
    FROM (
      SELECT jsonb_build_object(
        'resultId',result.id,
        'learnerPersonId',person.id,
        'learnerName',concat_ws(' ',coalesce(person.preferred_name,person.legal_given_names),person.legal_family_name),
        'courseRunId',run.id,
        'courseTitle',run.title,
        'itemTitle',item.title,
        'rawScore',result.raw_score,
        'calculatedScore',result.calculated_score,
        'overrideScore',result.override_score,
        'state',result.state,
        'publishedAt',result.published_at
      ) record
      FROM learner_grade_results result
      JOIN enrolments enrolment ON enrolment.tenant_id=result.tenant_id AND enrolment.id=result.enrolment_id
      JOIN people person ON person.tenant_id=enrolment.tenant_id AND person.id=enrolment.learner_person_id
      JOIN gradebook_items item ON item.tenant_id=result.tenant_id AND item.id=result.gradebook_item_id
      JOIN course_runs run ON run.tenant_id=item.tenant_id AND run.id=item.course_run_id
      WHERE result.tenant_id=job.tenant_id
        AND (job.institution_id IS NULL OR item.institution_id=job.institution_id)
        AND (learner_filter IS NULL OR enrolment.learner_person_id=learner_filter)
        AND (course_run_filter IS NULL OR item.course_run_id=course_run_filter)
        AND (coalesce((job.filters->>'includeCorrected')::boolean,false) OR result.state <> 'corrected')
      ORDER BY person.legal_family_name,person.legal_given_names,item.title,result.id
      LIMIT 10000
    ) records;
  ELSIF job.export_type = 'transcript' THEN
    IF learner_filter IS NULL THEN RAISE EXCEPTION 'transcript export requires learnerPersonId'; END IF;
    title_value := 'Learner transcript export';
    columns_value := '["learnerPersonId","learnerName","courseCode","courseTitle","enrolmentStatus","completionResult","resultState","certificateStatus","certificateIssuedAt"]'::jsonb;
    SELECT coalesce(jsonb_agg(record ORDER BY record->>'courseCode'),'[]'::jsonb)
    INTO rows_value
    FROM (
      SELECT jsonb_build_object(
        'learnerPersonId',person.id,
        'learnerName',concat_ws(' ',coalesce(person.preferred_name,person.legal_given_names),person.legal_family_name),
        'courseCode',run.code,
        'courseTitle',run.title,
        'enrolmentStatus',enrolment.status,
        'completionResult',enrolment.completion_result,
        'resultState',CASE WHEN EXISTS (
          SELECT 1 FROM learner_grade_results result
          WHERE result.tenant_id=enrolment.tenant_id AND result.enrolment_id=enrolment.id
            AND result.state='published'
        ) THEN 'published' ELSE NULL END,
        'certificateStatus',certificate.status,
        'certificateIssuedAt',certificate.issued_at
      ) record
      FROM enrolments enrolment
      JOIN people person ON person.tenant_id=enrolment.tenant_id AND person.id=enrolment.learner_person_id
      JOIN course_runs run ON run.tenant_id=enrolment.tenant_id AND run.id=enrolment.course_run_id
      LEFT JOIN LATERAL (
        SELECT issued.status,issued.issued_at
        FROM issued_certificates issued
        WHERE issued.tenant_id=enrolment.tenant_id AND issued.enrolment_id=enrolment.id
        ORDER BY issued.issued_at DESC,issued.id DESC LIMIT 1
      ) certificate ON true
      WHERE enrolment.tenant_id=job.tenant_id
        AND enrolment.learner_person_id=learner_filter
        AND (job.institution_id IS NULL OR enrolment.institution_id=job.institution_id)
        AND enrolment.status IN ('active','completed','withdrawn')
      ORDER BY run.code,enrolment.id
      LIMIT 10000
    ) records;
  ELSIF job.export_type = 'analytics' THEN
    title_value := 'Analytics export';
    columns_value := '["metricKey","metricTitle","dimensionKey","dimensionValue","metricValue","measuredAt","sourceMaxOccurredAt"]'::jsonb;
    SELECT coalesce(jsonb_agg(record ORDER BY record->>'metricKey',record->>'dimensionKey',record->>'dimensionValue'),'[]'::jsonb)
    INTO rows_value
    FROM (
      SELECT jsonb_build_object(
        'metricKey',definition.metric_key,
        'metricTitle',definition.title,
        'dimensionKey',snapshot.dimension_key,
        'dimensionValue',snapshot.dimension_value,
        'metricValue',snapshot.metric_value,
        'measuredAt',snapshot.measured_at,
        'sourceMaxOccurredAt',snapshot.source_max_occurred_at
      ) record
      FROM metric_snapshots snapshot
      JOIN metric_definitions definition
        ON definition.tenant_id=snapshot.tenant_id AND definition.id=snapshot.metric_definition_id
      WHERE snapshot.tenant_id=job.tenant_id
        AND (job.institution_id IS NULL OR snapshot.institution_id=job.institution_id)
        AND (job.filters->>'metricKey' IS NULL OR definition.metric_key=job.filters->>'metricKey')
      ORDER BY definition.metric_key,snapshot.dimension_key,snapshot.dimension_value,snapshot.measured_at DESC
      LIMIT 10000
    ) records;
  ELSE
    RAISE EXCEPTION 'unsupported export type %',job.export_type;
  END IF;

  RETURN jsonb_build_object(
    'exportId',job.id,
    'title',title_value,
    'generatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tenantName',coalesce(tenant_name,'Veza tenant'),
    'institutionName',institution_name,
    'columns',columns_value,
    'rows',rows_value,
    'filters',job.filters
  );
END
$$;

CREATE OR REPLACE FUNCTION app.complete_export_job(
  p_export_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_object_key text,
  p_checksum text,
  p_row_count bigint,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE completed export_jobs%ROWTYPE;
BEGIN
  UPDATE export_jobs
  SET status='ready',object_key=p_object_key,checksum=p_checksum,row_count=p_row_count,
      ready_at=now(),expires_at=p_expires_at,failure_reason=NULL,
      leased_at=NULL,lease_owner=NULL,updated_at=now()
  WHERE id=p_export_id AND status='processing' AND lease_owner=p_worker_id AND attempts=p_attempt
  RETURNING * INTO completed;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO audit_events (
    tenant_id,plane,event_type,actor_id,membership_id,resource_type,resource_id,
    purpose,correlation_id,before_state,after_state,metadata
  ) VALUES (
    completed.tenant_id,'application','export.ready',completed.requested_by,NULL,
    'export-job',completed.id::text,'Complete governed export',
    'export:'||completed.id::text,
    jsonb_build_object('status','processing','attempt',completed.attempts),
    jsonb_build_object('status','ready','objectKey',completed.object_key,'checksum',completed.checksum,'rowCount',completed.row_count,'expiresAt',completed.expires_at),
    jsonb_build_object('workerId',p_worker_id,'format',completed.format,'exportType',completed.export_type)
  );
  INSERT INTO outbox_events (
    tenant_id,event_name,event_version,aggregate_type,aggregate_id,aggregate_version,
    actor_id,correlation_id,payload
  ) VALUES (
    completed.tenant_id,'export.ready',1,'export-job',completed.id::text,completed.attempts,
    completed.requested_by,'export:'||completed.id::text,
    jsonb_build_object('exportJobId',completed.id,'format',completed.format,'exportType',completed.export_type,'checksum',completed.checksum,'rowCount',completed.row_count,'expiresAt',completed.expires_at)
  );
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION app.fail_export_job(
  p_export_id uuid,
  p_worker_id text,
  p_attempt integer,
  p_error text,
  p_next_attempt_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE failed export_jobs%ROWTYPE;
DECLARE terminal boolean;
BEGIN
  UPDATE export_jobs
  SET status=CASE WHEN attempts>=maximum_attempts THEN 'failed' ELSE 'requested' END,
      next_attempt_at=p_next_attempt_at,
      failure_reason=left(p_error,2000),
      leased_at=NULL,lease_owner=NULL,updated_at=now()
  WHERE id=p_export_id AND status='processing' AND lease_owner=p_worker_id AND attempts=p_attempt
  RETURNING * INTO failed;
  IF NOT FOUND THEN RETURN false; END IF;
  terminal := failed.status='failed';
  IF terminal THEN
    INSERT INTO audit_events (
      tenant_id,plane,event_type,actor_id,membership_id,resource_type,resource_id,
      purpose,correlation_id,before_state,after_state,metadata
    ) VALUES (
      failed.tenant_id,'application','export.failed',failed.requested_by,NULL,
      'export-job',failed.id::text,'Record terminal export failure',
      'export:'||failed.id::text,
      jsonb_build_object('status','processing','attempt',failed.attempts),
      jsonb_build_object('status','failed','failureReason',failed.failure_reason),
      jsonb_build_object('workerId',p_worker_id,'format',failed.format,'exportType',failed.export_type)
    );
    INSERT INTO outbox_events (
      tenant_id,event_name,event_version,aggregate_type,aggregate_id,aggregate_version,
      actor_id,correlation_id,payload
    ) VALUES (
      failed.tenant_id,'export.failed',1,'export-job',failed.id::text,failed.attempts,
      failed.requested_by,'export:'||failed.id::text,
      jsonb_build_object('exportJobId',failed.id,'format',failed.format,'exportType',failed.export_type,'failureReason',failed.failure_reason)
    );
  END IF;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION app.expire_export_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE changed integer;
BEGIN
  UPDATE export_jobs
  SET status='expired',updated_at=now()
  WHERE status='ready' AND expires_at<=now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

REVOKE ALL ON FUNCTION app.claim_export_jobs(text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.export_document_payload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.complete_export_job(uuid,text,integer,text,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.fail_export_job(uuid,text,integer,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.expire_export_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_export_jobs(text,integer,integer) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.export_document_payload(uuid) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.complete_export_job(uuid,text,integer,text,text,bigint,timestamptz) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.fail_export_job(uuid,text,integer,text,timestamptz) TO veza_worker;
GRANT EXECUTE ON FUNCTION app.expire_export_jobs() TO veza_worker;

INSERT INTO scheduled_jobs (
  tenant_id,job_key,handler_key,payload,interval_seconds,next_run_at,status,created_by
) VALUES (
  NULL,'exports.expiry','exports.expiry','{}'::jsonb,3600,now(),'active',NULL
)
ON CONFLICT (tenant_id,job_key) DO UPDATE
SET handler_key=EXCLUDED.handler_key,status='active',updated_at=now();

COMMIT;
