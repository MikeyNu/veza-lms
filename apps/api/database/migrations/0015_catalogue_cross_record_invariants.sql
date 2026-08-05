BEGIN;

DO $$
DECLARE constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype='c'
      AND conrelid IN ('programme_versions'::regclass, 'course_blueprint_versions'::regclass)
      AND pg_get_constraintdef(oid) LIKE '%lifecycle%approved%approved_by%approved_at%effective_from%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_record.table_name, constraint_record.conname);
  END LOOP;
END $$;

ALTER TABLE programme_versions
  ADD CONSTRAINT programme_versions_approval_evidence_check
  CHECK (lifecycle <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL));
ALTER TABLE course_blueprint_versions
  ADD CONSTRAINT blueprint_versions_approval_evidence_check
  CHECK (lifecycle <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL));

CREATE OR REPLACE FUNCTION app.validate_course_run_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE period_record record;
DECLARE blueprint_record record;
BEGIN
  SELECT institution_id,status,starts_on,ends_on
  INTO period_record
  FROM academic_periods
  WHERE tenant_id=NEW.tenant_id AND id=NEW.academic_period_id;
  IF period_record IS NULL OR period_record.institution_id <> NEW.institution_id OR period_record.status <> 'published' THEN
    RAISE EXCEPTION 'course run requires a published academic period in the same institution';
  END IF;
  IF NEW.starts_on < period_record.starts_on OR NEW.ends_on > period_record.ends_on OR NEW.ends_on < NEW.starts_on THEN
    RAISE EXCEPTION 'course run dates must remain inside the academic period';
  END IF;

  SELECT institution_id,lifecycle,effective_from,effective_until,delivery_modes
  INTO blueprint_record
  FROM course_blueprint_versions
  WHERE tenant_id=NEW.tenant_id AND id=NEW.course_blueprint_version_id;
  IF blueprint_record IS NULL OR blueprint_record.institution_id <> NEW.institution_id OR blueprint_record.lifecycle <> 'approved' THEN
    RAISE EXCEPTION 'course run requires an approved blueprint in the same institution';
  END IF;
  IF blueprint_record.effective_from > NEW.starts_on OR (blueprint_record.effective_until IS NOT NULL AND blueprint_record.effective_until <= NEW.starts_on) THEN
    RAISE EXCEPTION 'course blueprint is not effective on the course run start date';
  END IF;
  IF NOT NEW.delivery_mode = ANY(blueprint_record.delivery_modes) THEN
    RAISE EXCEPTION 'course run delivery mode is not permitted by its blueprint';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER course_runs_integrity
BEFORE INSERT OR UPDATE OF institution_id,academic_period_id,course_blueprint_version_id,delivery_mode,starts_on,ends_on
ON course_runs
FOR EACH ROW EXECUTE FUNCTION app.validate_course_run_integrity();

CREATE OR REPLACE FUNCTION app.validate_class_section_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE run_institution uuid;
DECLARE cohort_institution uuid;
BEGIN
  SELECT institution_id INTO run_institution
  FROM course_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.course_run_id;
  IF run_institution IS NULL OR run_institution <> NEW.institution_id THEN
    RAISE EXCEPTION 'class section must belong to the same institution as its course run';
  END IF;
  IF NEW.cohort_id IS NOT NULL THEN
    SELECT institution_id INTO cohort_institution
    FROM cohorts WHERE tenant_id=NEW.tenant_id AND id=NEW.cohort_id;
    IF cohort_institution IS NULL OR cohort_institution <> NEW.institution_id THEN
      RAISE EXCEPTION 'class section cohort must belong to the same institution';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER class_sections_integrity
BEFORE INSERT OR UPDATE OF institution_id,course_run_id,cohort_id
ON class_sections
FOR EACH ROW EXECUTE FUNCTION app.validate_class_section_integrity();

CREATE OR REPLACE FUNCTION app.validate_enrolment_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE learner_institution uuid;
DECLARE run_institution uuid;
DECLARE section_run uuid;
DECLARE section_institution uuid;
DECLARE cohort_institution uuid;
BEGIN
  SELECT institution_id INTO learner_institution
  FROM learner_profiles WHERE tenant_id=NEW.tenant_id AND person_id=NEW.learner_person_id;
  IF learner_institution IS NULL OR learner_institution <> NEW.institution_id THEN
    RAISE EXCEPTION 'enrolment learner profile must belong to the same institution';
  END IF;

  SELECT institution_id INTO run_institution
  FROM course_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.course_run_id;
  IF run_institution IS NULL OR run_institution <> NEW.institution_id THEN
    RAISE EXCEPTION 'enrolment course run must belong to the same institution';
  END IF;

  IF NEW.class_section_id IS NOT NULL THEN
    SELECT course_run_id,institution_id INTO section_run,section_institution
    FROM class_sections WHERE tenant_id=NEW.tenant_id AND id=NEW.class_section_id;
    IF section_run IS NULL OR section_run <> NEW.course_run_id OR section_institution <> NEW.institution_id THEN
      RAISE EXCEPTION 'enrolment class section must belong to the selected course run and institution';
    END IF;
  END IF;

  IF NEW.cohort_id IS NOT NULL THEN
    SELECT institution_id INTO cohort_institution
    FROM cohorts WHERE tenant_id=NEW.tenant_id AND id=NEW.cohort_id;
    IF cohort_institution IS NULL OR cohort_institution <> NEW.institution_id THEN
      RAISE EXCEPTION 'enrolment cohort must belong to the same institution';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrolments_integrity
BEFORE INSERT OR UPDATE OF institution_id,learner_person_id,course_run_id,class_section_id,cohort_id
ON enrolments
FOR EACH ROW EXECUTE FUNCTION app.validate_enrolment_integrity();

COMMIT;
