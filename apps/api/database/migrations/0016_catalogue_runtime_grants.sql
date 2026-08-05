BEGIN;

GRANT SELECT, INSERT, UPDATE ON
  learning_outcomes,
  programmes,
  programme_versions,
  course_definitions,
  course_blueprint_versions,
  programme_version_courses,
  blueprint_outcome_mappings,
  course_requisites,
  course_runs,
  cohorts,
  class_sections,
  class_staff_allocations,
  enrolments,
  enrolment_transitions
TO veza_app;

GRANT SELECT ON
  learning_outcomes,
  programmes,
  programme_versions,
  course_definitions,
  course_blueprint_versions,
  programme_version_courses,
  blueprint_outcome_mappings,
  course_requisites,
  course_runs,
  cohorts,
  class_sections,
  class_staff_allocations,
  enrolments,
  enrolment_transitions
TO veza_control;

COMMIT;
