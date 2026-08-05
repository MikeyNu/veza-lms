BEGIN;

CREATE TABLE course_offerings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 2 AND 48),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  registration_mode text NOT NULL DEFAULT 'managed'
    CHECK (registration_mode IN ('managed','self-service','invitation-only')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','closed','completed','cancelled')),
  opens_at timestamptz,
  closes_at timestamptz,
  capacity_override integer CHECK (capacity_override IS NULL OR capacity_override > 0),
  waitlist_enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_run_id, code),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id) ON DELETE CASCADE,
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);

CREATE UNIQUE INDEX course_offerings_one_active_default_idx
  ON course_offerings (tenant_id, course_run_id)
  WHERE status IN ('draft','open') AND code = 'DEFAULT';

CREATE TABLE course_run_overlays (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  overlay jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, course_run_id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(overlay) = 'object'),
  CHECK (octet_length(overlay::text) <= 262144)
);

CREATE TABLE timetable_slots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  course_run_id uuid NOT NULL,
  class_section_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg'
    CHECK (length(btrim(timezone)) BETWEEN 3 AND 80),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('in_person','online','blended','workplace')),
  room_key text,
  location_label text,
  online_join_url text,
  recurrence_key text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','cancelled','completed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, course_run_id) REFERENCES course_runs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, class_section_id) REFERENCES class_sections(tenant_id, id) ON DELETE CASCADE,
  CHECK (ends_at > starts_at),
  CHECK (room_key IS NULL OR length(btrim(room_key)) BETWEEN 1 AND 120),
  CHECK (location_label IS NULL OR length(btrim(location_label)) BETWEEN 1 AND 240),
  CHECK (online_join_url IS NULL OR online_join_url ~ '^https://'),
  CHECK (recurrence_key IS NULL OR length(btrim(recurrence_key)) BETWEEN 1 AND 160)
);
CREATE INDEX timetable_slots_run_time_idx
  ON timetable_slots (tenant_id, course_run_id, starts_at, ends_at)
  WHERE status = 'scheduled';
CREATE INDEX timetable_slots_class_time_idx
  ON timetable_slots (tenant_id, class_section_id, starts_at, ends_at)
  WHERE status = 'scheduled';
CREATE INDEX timetable_slots_room_time_idx
  ON timetable_slots (tenant_id, institution_id, room_key, starts_at, ends_at)
  WHERE status = 'scheduled' AND room_key IS NOT NULL;

ALTER TABLE enrolments
  ADD COLUMN offering_id uuid,
  ADD COLUMN reinstated_from_enrolment_id uuid,
  ADD COLUMN eligibility_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT enrolments_offering_fk
    FOREIGN KEY (tenant_id, offering_id) REFERENCES course_offerings(tenant_id, id),
  ADD CONSTRAINT enrolments_reinstated_from_fk
    FOREIGN KEY (tenant_id, reinstated_from_enrolment_id) REFERENCES enrolments(tenant_id, id),
  ADD CONSTRAINT enrolments_eligibility_snapshot_check
    CHECK (jsonb_typeof(eligibility_snapshot) = 'object' AND octet_length(eligibility_snapshot::text) <= 131072);

CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  learner_person_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN -1000 AND 1000),
  position bigint NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting','offered','promoted','declined','expired','cancelled')),
  offer_expires_at timestamptz,
  promoted_enrolment_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, offering_id, learner_person_id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, offering_id) REFERENCES course_offerings(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, learner_person_id) REFERENCES people(tenant_id, id),
  FOREIGN KEY (tenant_id, promoted_enrolment_id) REFERENCES enrolments(tenant_id, id),
  CHECK (offer_expires_at IS NULL OR offer_expires_at > requested_at),
  CHECK (status <> 'promoted' OR promoted_enrolment_id IS NOT NULL)
);
CREATE INDEX waitlist_entries_queue_idx
  ON waitlist_entries (tenant_id, offering_id, status, priority DESC, position, requested_at);

CREATE TABLE enrolment_membership_periods (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  enrolment_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','active','waitlisted','withdrawn','completed','cancelled')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  actor_id uuid NOT NULL REFERENCES users(id),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 8 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, institution_id) REFERENCES institutions(tenant_id, id),
  FOREIGN KEY (tenant_id, enrolment_id) REFERENCES enrolments(tenant_id, id) ON DELETE CASCADE,
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);
CREATE UNIQUE INDEX enrolment_membership_one_current_idx
  ON enrolment_membership_periods (tenant_id, enrolment_id)
  WHERE effective_until IS NULL;
CREATE INDEX enrolment_membership_timeline_idx
  ON enrolment_membership_periods (tenant_id, enrolment_id, effective_from, id);

CREATE OR REPLACE FUNCTION app.delivery_capacity_for_offering(p_tenant_id uuid, p_offering_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(offering.capacity_override, run.capacity, 2147483647)
  FROM course_offerings offering
  JOIN course_runs run
    ON run.tenant_id = offering.tenant_id AND run.id = offering.course_run_id
  WHERE offering.tenant_id = p_tenant_id AND offering.id = p_offering_id
$$;

CREATE OR REPLACE FUNCTION app.validate_enrolment_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  run_record record;
  offering_record record;
  current_count integer;
  missing_prerequisites jsonb;
  class_conflict_count integer;
BEGIN
  SELECT run.*, blueprint.course_definition_id, blueprint.lifecycle blueprint_lifecycle,
         blueprint.effective_from blueprint_effective_from,
         blueprint.effective_until blueprint_effective_until
  INTO run_record
  FROM course_runs run
  JOIN course_blueprint_versions blueprint
    ON blueprint.tenant_id = run.tenant_id
   AND blueprint.id = run.course_blueprint_version_id
  WHERE run.tenant_id = NEW.tenant_id AND run.id = NEW.course_run_id;

  IF run_record.id IS NULL THEN
    RAISE EXCEPTION 'course run was not found';
  END IF;
  IF run_record.institution_id <> NEW.institution_id THEN
    RAISE EXCEPTION 'enrolment institution does not match course run';
  END IF;
  IF run_record.blueprint_lifecycle <> 'approved' THEN
    RAISE EXCEPTION 'enrolment requires an approved blueprint version';
  END IF;
  IF run_record.lifecycle NOT IN ('scheduled','open','in_progress') THEN
    RAISE EXCEPTION 'course run does not accept enrolments in its current lifecycle';
  END IF;

  IF NEW.offering_id IS NOT NULL THEN
    SELECT * INTO offering_record
    FROM course_offerings
    WHERE tenant_id = NEW.tenant_id AND id = NEW.offering_id;
    IF offering_record.id IS NULL OR offering_record.course_run_id <> NEW.course_run_id THEN
      RAISE EXCEPTION 'offering does not belong to the selected course run';
    END IF;
    IF offering_record.status NOT IN ('draft','open') THEN
      RAISE EXCEPTION 'offering is not accepting enrolments';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'requiredCourseDefinitionId', requisite.required_course_definition_id,
    'type', requisite.requisite_type,
    'minimumResult', requisite.minimum_result
  )), '[]'::jsonb)
  INTO missing_prerequisites
  FROM course_requisites requisite
  WHERE requisite.tenant_id = NEW.tenant_id
    AND requisite.course_blueprint_version_id = run_record.course_blueprint_version_id
    AND requisite.requisite_type IN ('prerequisite','corequisite')
    AND NOT EXISTS (
      SELECT 1
      FROM enrolments prior
      JOIN course_runs prior_run
        ON prior_run.tenant_id = prior.tenant_id AND prior_run.id = prior.course_run_id
      JOIN course_blueprint_versions prior_blueprint
        ON prior_blueprint.tenant_id = prior_run.tenant_id
       AND prior_blueprint.id = prior_run.course_blueprint_version_id
      WHERE prior.tenant_id = NEW.tenant_id
        AND prior.learner_person_id = NEW.learner_person_id
        AND prior_blueprint.course_definition_id = requisite.required_course_definition_id
        AND (
          (requisite.requisite_type = 'prerequisite'
           AND prior.status = 'completed'
           AND (requisite.minimum_result IS NULL OR prior.completion_result >= requisite.minimum_result))
          OR
          (requisite.requisite_type = 'corequisite'
           AND prior.status IN ('pending','active','completed')
           AND prior.effective_until IS NULL)
        )
    );

  IF jsonb_array_length(missing_prerequisites) > 0 THEN
    RAISE EXCEPTION 'learner does not satisfy required prerequisites: %', missing_prerequisites;
  END IF;

  IF NEW.class_section_id IS NOT NULL AND NEW.status IN ('pending','active') THEN
    SELECT count(*) INTO class_conflict_count
    FROM timetable_slots requested_slot
    JOIN timetable_slots existing_slot
      ON existing_slot.tenant_id = requested_slot.tenant_id
     AND existing_slot.status = 'scheduled'
     AND requested_slot.starts_at < existing_slot.ends_at
     AND existing_slot.starts_at < requested_slot.ends_at
    JOIN enrolments existing_enrolment
      ON existing_enrolment.tenant_id = existing_slot.tenant_id
     AND existing_enrolment.class_section_id = existing_slot.class_section_id
     AND existing_enrolment.learner_person_id = NEW.learner_person_id
     AND existing_enrolment.status IN ('pending','active')
     AND existing_enrolment.effective_until IS NULL
    WHERE requested_slot.tenant_id = NEW.tenant_id
      AND requested_slot.class_section_id = NEW.class_section_id
      AND requested_slot.status = 'scheduled'
      AND existing_enrolment.id IS DISTINCT FROM NEW.id;
    IF class_conflict_count > 0 THEN
      RAISE EXCEPTION 'learner timetable conflict detected';
    END IF;
  END IF;

  IF NEW.status IN ('pending','active') THEN
    IF NEW.offering_id IS NOT NULL THEN
      SELECT count(*) INTO current_count
      FROM enrolments
      WHERE tenant_id = NEW.tenant_id
        AND offering_id = NEW.offering_id
        AND status IN ('pending','active')
        AND effective_until IS NULL
        AND id IS DISTINCT FROM NEW.id;
      IF current_count >= app.delivery_capacity_for_offering(NEW.tenant_id, NEW.offering_id) THEN
        IF offering_record.waitlist_enabled THEN
          NEW.status := 'waitlisted';
        ELSE
          RAISE EXCEPTION 'offering capacity has been reached';
        END IF;
      END IF;
    ELSIF run_record.capacity IS NOT NULL THEN
      SELECT count(*) INTO current_count
      FROM enrolments
      WHERE tenant_id = NEW.tenant_id
        AND course_run_id = NEW.course_run_id
        AND status IN ('pending','active')
        AND effective_until IS NULL
        AND id IS DISTINCT FROM NEW.id;
      IF current_count >= run_record.capacity THEN
        NEW.status := 'waitlisted';
      END IF;
    END IF;
  END IF;

  NEW.eligibility_snapshot := jsonb_build_object(
    'validatedAt', now(),
    'courseRunId', NEW.course_run_id,
    'offeringId', NEW.offering_id,
    'blueprintVersionId', run_record.course_blueprint_version_id,
    'prerequisitesSatisfied', true,
    'timetableConflict', false,
    'capacityDecision', NEW.status
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrolments_validate_eligibility
BEFORE INSERT OR UPDATE OF course_run_id, class_section_id, offering_id, learner_person_id, status
ON enrolments
FOR EACH ROW EXECUTE FUNCTION app.validate_enrolment_eligibility();

CREATE OR REPLACE FUNCTION app.sync_enrolment_membership_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reason_text text;
  actor_value uuid;
  correlation_value text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    reason_text := 'Initial enrolment membership state';
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  ELSE
    reason_text := COALESCE(NULLIF(btrim(NEW.withdrawal_reason), ''), 'Enrolment lifecycle transition recorded');
  END IF;

  actor_value := NEW.updated_by;
  correlation_value := COALESCE(NULLIF(current_setting('app.correlation_id', true), ''), 'database-transition');

  UPDATE enrolment_membership_periods
  SET effective_until = now()
  WHERE tenant_id = NEW.tenant_id
    AND enrolment_id = NEW.id
    AND effective_until IS NULL;

  INSERT INTO enrolment_membership_periods (
    id, tenant_id, institution_id, enrolment_id, status,
    effective_from, reason, actor_id, correlation_id
  ) VALUES (
    gen_random_uuid(), NEW.tenant_id, NEW.institution_id, NEW.id, NEW.status,
    now(), reason_text, actor_value, correlation_value
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrolments_membership_period_sync
AFTER INSERT OR UPDATE OF status ON enrolments
FOR EACH ROW EXECUTE FUNCTION app.sync_enrolment_membership_period();

CREATE OR REPLACE FUNCTION app.prevent_room_timetable_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'scheduled' AND NEW.room_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM timetable_slots slot
    WHERE slot.tenant_id = NEW.tenant_id
      AND slot.institution_id = NEW.institution_id
      AND slot.room_key = NEW.room_key
      AND slot.status = 'scheduled'
      AND slot.id IS DISTINCT FROM NEW.id
      AND NEW.starts_at < slot.ends_at
      AND slot.starts_at < NEW.ends_at
  ) THEN
    RAISE EXCEPTION 'room timetable conflict detected';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER timetable_slots_room_conflict
BEFORE INSERT OR UPDATE ON timetable_slots
FOR EACH ROW EXECUTE FUNCTION app.prevent_room_timetable_conflict();

CREATE OR REPLACE FUNCTION app.prevent_staff_timetable_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.valid_until IS NULL OR NEW.valid_until >= NEW.valid_from THEN
    IF EXISTS (
      SELECT 1
      FROM timetable_slots requested_slot
      JOIN class_staff_allocations other
        ON other.tenant_id = requested_slot.tenant_id
       AND other.person_id = NEW.person_id
       AND other.class_section_id <> NEW.class_section_id
      JOIN timetable_slots other_slot
        ON other_slot.tenant_id = other.tenant_id
       AND other_slot.class_section_id = other.class_section_id
       AND other_slot.status = 'scheduled'
       AND requested_slot.starts_at < other_slot.ends_at
       AND other_slot.starts_at < requested_slot.ends_at
      WHERE requested_slot.tenant_id = NEW.tenant_id
        AND requested_slot.class_section_id = NEW.class_section_id
        AND requested_slot.status = 'scheduled'
        AND requested_slot.starts_at::date >= NEW.valid_from
        AND (NEW.valid_until IS NULL OR requested_slot.starts_at::date <= NEW.valid_until)
    ) THEN
      RAISE EXCEPTION 'staff timetable conflict detected';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER class_staff_allocations_conflict
BEFORE INSERT OR UPDATE ON class_staff_allocations
FOR EACH ROW EXECUTE FUNCTION app.prevent_staff_timetable_conflict();

CREATE OR REPLACE FUNCTION app.enqueue_waitlisted_enrolment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_position bigint;
BEGIN
  IF NEW.status = 'waitlisted' AND NEW.offering_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT COALESCE(max(position), 0) + 1 INTO next_position
    FROM waitlist_entries
    WHERE tenant_id = NEW.tenant_id AND offering_id = NEW.offering_id;

    INSERT INTO waitlist_entries (
      id, tenant_id, institution_id, offering_id, learner_person_id,
      position, created_by, updated_by
    ) VALUES (
      gen_random_uuid(), NEW.tenant_id, NEW.institution_id, NEW.offering_id,
      NEW.learner_person_id, next_position, NEW.created_by, NEW.updated_by
    )
    ON CONFLICT (tenant_id, offering_id, learner_person_id)
    DO UPDATE SET status = 'waiting', updated_by = EXCLUDED.updated_by,
                  updated_at = now(), version = waitlist_entries.version + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enrolments_waitlist_queue
AFTER INSERT OR UPDATE OF status ON enrolments
FOR EACH ROW EXECUTE FUNCTION app.enqueue_waitlisted_enrolment();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'course_offerings','course_run_overlays','timetable_slots',
    'waitlist_entries','enrolment_membership_periods'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
      table_name, table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON
  course_offerings,
  course_run_overlays,
  timetable_slots,
  waitlist_entries,
  enrolment_membership_periods
TO veza_app;

COMMIT;
