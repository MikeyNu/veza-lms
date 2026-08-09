BEGIN;

-- A historical local-development helper granted every runtime role access to
-- every table and function. Reconcile those ACLs to the explicit privileges
-- produced by a clean migration run so local testing retains production's
-- application/control-plane/worker separation.
ALTER DEFAULT PRIVILEGES FOR ROLE veza_migrator IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM veza_app, veza_control, veza_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE veza_migrator IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM veza_app, veza_control, veza_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE veza_migrator IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM veza_app, veza_control, veza_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE veza_migrator IN SCHEMA app
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM veza_app, veza_control, veza_worker;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM veza_app, veza_control, veza_worker;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM veza_app, veza_control, veza_worker;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM veza_app, veza_control, veza_worker;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM veza_app, veza_control, veza_worker;

GRANT USAGE ON SCHEMA public, app TO veza_app, veza_control, veza_worker;

GRANT DELETE ON
  curriculum_change_reviews, curriculum_validation_policies,
  institution_terminology_entries, institution_terminology_versions,
  programme_hierarchy_levels, programme_outcome_requirements
TO veza_app;

GRANT INSERT ON
  academic_periods, api_idempotency_records, api_quota_policies,
  assignment_accommodations, assignment_group_members, assignment_groups,
  assignment_rubrics, assignments, audit_events, award_rule_evaluations,
  blueprint_outcome_mappings, campuses, certificate_award_rules,
  certificate_templates, class_sections, class_staff_allocations, cohorts,
  course_announcements, course_blueprint_versions, course_definitions,
  course_discussion_posts, course_discussions, course_offerings, course_requisites,
  course_run_overlays, course_runs, curriculum_change_reviews,
  curriculum_validation_policies, enrolment_membership_periods,
  enrolment_transitions, enrolments, entitlement_denial_diagnostics, export_jobs,
  gradebook_categories, gradebook_formula_versions, gradebook_items,
  institution_terminology_entries, institution_terminology_versions,
  institutional_policies, institutions, issued_certificates, learner_bookmarks,
  learner_completion_evidence, learner_grade_results, learner_offline_manifests,
  learner_profiles, learner_progress_snapshots, learner_sync_operations,
  learning_outcomes, marker_allocations, media_assets, media_processing_jobs,
  media_renditions, media_text_tracks, media_upload_sessions,
  membership_invitations, memberships, metric_definitions, metric_snapshots,
  notification_deliveries, notification_digest_batches, notification_digest_items,
  notification_intents, notification_preferences, notification_provider_events,
  notification_recipient_suppressions, notification_template_versions,
  notification_templates, organisational_units, outbox_events, people,
  people_import_rows, people_imports, person_addresses, person_consents,
  person_contact_points, person_data_subject_requests,
  person_disclosure_restrictions, person_duplicate_candidates, person_identifiers,
  person_identity_link_requests, person_merges, person_organisational_assignments,
  person_relationship_invitations, person_relationships, platform_error_reports,
  platform_runtime_heartbeats, programme_hierarchy_levels,
  programme_outcome_requirements, programme_version_courses, programme_versions,
  programmes, recording_consents, request_observations, role_assignments,
  rubric_criteria, rubrics, search_documents, search_index_operations,
  search_query_events, search_reconciliation_runs, search_synonyms,
  security_observations, service_account_secrets, service_accounts,
  staff_engagements, staff_profiles, storage_deletion_requests, storage_policies,
  storage_quota_policies, storage_usage_ledger, studio_assets, studio_comments,
  studio_course_spaces, studio_import_reports, studio_lesson_outcomes,
  studio_lesson_revisions, studio_lessons, studio_modules,
  studio_publication_snapshots, studio_reusable_blocks, studio_review_requests,
  studio_revision_assets, studio_templates, submission_attempts, submission_files,
  submission_marks, tenant_sender_configurations, tenant_setup_profiles,
  tenant_storage_namespaces, timetable_slots, waitlist_entries,
  webhook_deliveries, webhook_endpoints, webhook_replay_nonces
TO veza_app;

GRANT SELECT ON
  academic_periods, api_deprecation_registry, api_idempotency_records,
  api_quota_policies, assignment_accommodations, assignment_group_members,
  assignment_groups, assignment_rubrics, assignments, audit_events,
  award_rule_evaluations, blueprint_outcome_mappings, campuses,
  certificate_award_rules, certificate_templates, class_sections,
  class_staff_allocations, cohorts, course_announcements, course_blueprint_versions,
  course_definitions, course_discussion_posts, course_discussions, course_offerings,
  course_requisites, course_run_overlays, course_runs, curriculum_change_reviews,
  curriculum_validation_policies, enrolment_membership_periods,
  enrolment_transitions, enrolments, export_jobs, gradebook_categories,
  gradebook_formula_versions, gradebook_items, institution_terminology_entries,
  institution_terminology_versions, institutional_policies, institutions,
  issued_certificates, learner_bookmarks, learner_completion_evidence,
  learner_grade_results, learner_offline_manifests, learner_profiles,
  learner_progress_snapshots, learner_sync_operations, learning_outcomes,
  marker_allocations, media_assets, media_processing_jobs, media_renditions,
  media_text_tracks, media_upload_sessions, membership_invitations, memberships,
  metric_definitions, metric_refresh_runs, metric_snapshots,
  notification_deliveries, notification_digest_batches, notification_digest_items,
  notification_intents, notification_preferences, notification_provider_events,
  notification_recipient_suppressions, notification_template_versions,
  notification_templates, organisational_units, outbox_events, people,
  people_import_rows, people_imports, person_addresses, person_consents,
  person_contact_points, person_data_subject_requests,
  person_disclosure_restrictions, person_duplicate_candidates, person_identifiers,
  person_identity_link_requests, person_merges, person_organisational_assignments,
  person_relationship_invitations, person_relationships,
  platform_runtime_heartbeats, programme_hierarchy_levels,
  programme_outcome_requirements, programme_version_courses, programme_versions,
  programmes, recording_consents, role_assignments, rubric_criteria, rubrics,
  search_documents, search_index_operations, search_query_events,
  search_reconciliation_runs, search_synonyms, service_account_secrets,
  service_accounts, staff_engagements, staff_profiles, storage_deletion_requests,
  storage_policies, storage_quota_policies, storage_usage_ledger, studio_assets,
  studio_comments, studio_course_spaces, studio_import_reports,
  studio_lesson_outcomes, studio_lesson_revisions, studio_lessons, studio_modules,
  studio_publication_snapshots, studio_reusable_blocks, studio_review_requests,
  studio_revision_assets, studio_templates, submission_attempts, submission_files,
  submission_marks, tenant_entitlements, tenant_sender_configurations,
  tenant_setup_profiles, tenant_storage_namespaces, tenants, timetable_slots,
  waitlist_entries, webhook_deliveries, webhook_endpoints, webhook_replay_nonces
TO veza_app;

GRANT UPDATE ON
  academic_periods, api_idempotency_records, api_quota_policies,
  assignment_accommodations, assignment_group_members, assignment_groups,
  assignment_rubrics, assignments, blueprint_outcome_mappings, campuses,
  certificate_award_rules, certificate_templates, class_sections,
  class_staff_allocations, cohorts, course_announcements, course_blueprint_versions,
  course_definitions, course_discussion_posts, course_discussions, course_offerings,
  course_requisites, course_run_overlays, course_runs, curriculum_change_reviews,
  curriculum_validation_policies, enrolment_membership_periods,
  enrolment_transitions, enrolments, export_jobs, gradebook_categories,
  gradebook_formula_versions, gradebook_items, institution_terminology_entries,
  institution_terminology_versions, institutional_policies, institutions,
  issued_certificates, learner_bookmarks, learner_grade_results, learner_profiles,
  learner_sync_operations, learning_outcomes, marker_allocations, media_assets,
  media_processing_jobs, media_renditions, media_text_tracks, media_upload_sessions,
  membership_invitations, memberships, metric_definitions, metric_snapshots,
  notification_deliveries, notification_digest_batches, notification_digest_items,
  notification_intents, notification_preferences, notification_provider_events,
  notification_recipient_suppressions, notification_template_versions,
  notification_templates, organisational_units, outbox_events, people,
  people_import_rows, people_imports, person_addresses, person_consents,
  person_contact_points, person_data_subject_requests,
  person_disclosure_restrictions, person_duplicate_candidates, person_identifiers,
  person_identity_link_requests, person_merges, person_organisational_assignments,
  person_relationship_invitations, person_relationships, platform_error_reports,
  platform_runtime_heartbeats, programme_hierarchy_levels,
  programme_outcome_requirements, programme_version_courses, programme_versions,
  programmes, recording_consents, role_assignments, rubric_criteria, rubrics,
  search_documents, search_index_operations, search_query_events,
  search_reconciliation_runs, search_synonyms, service_account_secrets,
  service_accounts, staff_engagements, staff_profiles, storage_deletion_requests,
  storage_policies, storage_quota_policies, storage_usage_ledger, studio_assets,
  studio_comments, studio_course_spaces, studio_import_reports, studio_lessons,
  studio_modules, studio_publication_snapshots, studio_reusable_blocks,
  studio_review_requests, studio_templates, submission_attempts, submission_files,
  submission_marks, tenant_sender_configurations, tenant_setup_profiles,
  tenant_storage_namespaces, tenants, timetable_slots, waitlist_entries,
  webhook_deliveries, webhook_endpoints, webhook_replay_nonces
TO veza_app;

GRANT INSERT ON
  audit_events, entitlement_denial_diagnostics, event_consumer_definitions,
  event_consumer_subscriptions, event_reconciliation_runs, event_replay_requests,
  event_schema_registry, feature_flags, membership_invitations, memberships,
  outbox_events, plan_change_history, plan_module_catalogue,
  plan_policy_module_entitlements, plan_policy_versions, platform_audit_events,
  platform_operation_requests, platform_release_versions,
  platform_security_incident_events, platform_security_incidents,
  provisioning_requests, release_compatibility_reports, release_ring_feature_flags,
  release_ring_targets, release_rings, release_rollback_decisions, role_assignments,
  scheduled_job_runs, scheduled_jobs, support_case_approvals, support_cases,
  support_elevation_sessions, support_session_events, tenant_billing_links,
  tenant_deletion_schedules, tenant_entitlement_history,
  tenant_entitlement_overrides, tenant_entitlements, tenant_export_receipts,
  tenant_feature_flag_overrides, tenant_lifecycle_events,
  tenant_operational_profiles, tenant_plan_assignments,
  tenant_release_assignments, tenant_release_exceptions,
  tenant_release_migration_status, tenant_retention_holds, tenant_usage_snapshots,
  tenant_usage_thresholds, tenants, users
TO veza_control;

GRANT SELECT ON
  alert_events, alert_rules, api_deprecation_registry, api_idempotency_records,
  api_quota_policies, audit_events, blueprint_outcome_mappings, class_sections,
  class_staff_allocations, cohorts, course_blueprint_versions, course_definitions,
  course_requisites, course_runs, enrolment_transitions, enrolments,
  entitlement_denial_diagnostics, event_consumer_definitions,
  event_consumer_inbox, event_consumer_subscriptions, event_delivery_evidence,
  event_reconciliation_runs, event_replay_requests, event_schema_registry,
  feature_flags, learning_outcomes, media_assets, media_processing_jobs,
  media_renditions, media_text_tracks, media_upload_sessions,
  membership_invitations, memberships, metric_refresh_runs,
  notification_deliveries, notification_digest_batches, notification_digest_items,
  notification_intents, notification_preferences, notification_provider_events,
  notification_recipient_suppressions, notification_template_versions,
  notification_templates, outbox_events, people, person_identity_link_requests,
  person_relationship_invitations, plan_change_history, plan_module_catalogue,
  plan_policy_module_entitlements, plan_policy_versions, plans,
  platform_audit_events, platform_error_reports, platform_operation_requests,
  platform_release_versions, platform_runtime_heartbeats,
  platform_security_incident_events, platform_security_incidents,
  programme_version_courses, programme_versions, programmes, provisioning_requests,
  recording_consents, release_compatibility_reports, release_ring_feature_flags,
  release_ring_targets, release_ring_tenants, release_rings,
  release_rollback_decisions, request_observations, role_assignments,
  scheduled_job_runs, scheduled_jobs, search_documents, search_index_operations,
  search_query_events, search_reconciliation_runs, search_synonyms,
  security_observations, service_account_secrets, service_accounts,
  slo_definitions, slo_measurements, storage_deletion_requests, storage_policies,
  storage_quota_policies, storage_usage_ledger, support_case_approvals,
  support_cases, support_elevation_sessions, support_session_events,
  tenant_billing_links, tenant_deletion_schedules, tenant_entitlement_history,
  tenant_entitlement_overrides, tenant_entitlements, tenant_export_receipts,
  tenant_feature_flag_overrides, tenant_lifecycle_events,
  tenant_operational_profiles, tenant_plan_assignments,
  tenant_release_assignments, tenant_release_exceptions,
  tenant_release_migration_status, tenant_retention_holds,
  tenant_sender_configurations, tenant_storage_namespaces, tenant_usage_snapshots,
  tenant_usage_thresholds, tenants, users, webhook_deliveries, webhook_endpoints
TO veza_control;

GRANT UPDATE ON
  entitlement_denial_diagnostics, event_consumer_definitions,
  event_consumer_subscriptions, event_reconciliation_runs, event_replay_requests,
  event_schema_registry, feature_flags, membership_invitations, memberships,
  outbox_events, people, person_identity_link_requests,
  person_relationship_invitations, plan_module_catalogue,
  plan_policy_module_entitlements, plan_policy_versions, platform_error_reports,
  platform_operation_requests, platform_release_versions,
  platform_security_incidents, provisioning_requests, release_compatibility_reports,
  release_ring_feature_flags, release_ring_targets, release_rings,
  release_rollback_decisions, role_assignments, scheduled_job_runs, scheduled_jobs,
  support_case_approvals, support_cases, support_elevation_sessions,
  tenant_billing_links, tenant_deletion_schedules, tenant_entitlement_overrides,
  tenant_entitlements, tenant_export_receipts, tenant_feature_flag_overrides,
  tenant_operational_profiles, tenant_plan_assignments,
  tenant_release_assignments, tenant_release_exceptions,
  tenant_release_migration_status, tenant_retention_holds, tenant_usage_snapshots,
  tenant_usage_thresholds, tenants, users
TO veza_control;

GRANT SELECT (verification_code, payload, status, issued_at, revocation_reason)
  ON issued_certificates TO veza_control;

-- Tenant-scoped application queries may resolve a principal's public identity
-- fields, but cannot read identity-provider subjects or mutate global users.
GRANT SELECT (id, email, display_name, status) ON users TO veza_app;

GRANT INSERT ON
  alert_events, api_idempotency_records, api_quota_policies,
  event_consumer_inbox, event_delivery_evidence, event_reconciliation_runs,
  event_replay_requests, media_assets, media_processing_jobs, media_renditions,
  media_text_tracks, media_upload_sessions, metric_refresh_runs,
  notification_deliveries, notification_digest_batches, notification_digest_items,
  notification_intents, notification_preferences, notification_provider_events,
  notification_recipient_suppressions, notification_template_versions,
  notification_templates, platform_error_reports, platform_runtime_heartbeats,
  recording_consents, release_compatibility_reports, scheduled_job_runs,
  scheduled_jobs, search_documents, search_index_operations, search_query_events,
  search_reconciliation_runs, search_synonyms, service_accounts, slo_measurements,
  storage_deletion_requests, storage_policies, storage_quota_policies,
  storage_usage_ledger, tenant_release_migration_status,
  tenant_sender_configurations, tenant_storage_namespaces, webhook_deliveries,
  webhook_endpoints, webhook_replay_nonces
TO veza_worker;

GRANT SELECT ON
  alert_events, alert_rules, api_idempotency_records, api_quota_policies,
  course_blueprint_versions, course_definitions, course_runs,
  event_consumer_definitions, event_consumer_inbox, event_consumer_subscriptions,
  event_delivery_evidence, event_reconciliation_runs, event_replay_requests,
  event_schema_registry, institutions, media_assets, media_processing_jobs,
  media_renditions, media_text_tracks, media_upload_sessions, metric_refresh_runs,
  metric_snapshots, notification_deliveries, notification_digest_batches,
  notification_digest_items, notification_intents, notification_preferences,
  notification_provider_events, notification_recipient_suppressions,
  notification_template_versions, notification_templates, outbox_events,
  people, platform_runtime_heartbeats, programme_versions, programmes,
  recording_consents, release_compatibility_reports, request_observations,
  scheduled_job_runs, scheduled_jobs, search_documents, search_index_operations,
  search_query_events, search_reconciliation_runs, search_synonyms,
  service_accounts, slo_definitions, slo_measurements, storage_deletion_requests,
  storage_policies,
  storage_quota_policies, storage_usage_ledger, tenant_plan_assignments,
  studio_lesson_revisions, studio_lessons, tenant_release_migration_status,
  tenant_sender_configurations,
  tenant_storage_namespaces, webhook_deliveries, webhook_endpoints,
  webhook_replay_nonces
TO veza_worker;

GRANT UPDATE ON
  alert_events, api_idempotency_records, api_quota_policies,
  event_consumer_inbox, event_delivery_evidence, event_reconciliation_runs,
  event_replay_requests, media_assets, media_processing_jobs, media_renditions,
  media_text_tracks, media_upload_sessions, metric_refresh_runs,
  notification_deliveries, notification_digest_batches, notification_digest_items,
  notification_intents, notification_preferences, notification_provider_events,
  notification_recipient_suppressions, notification_template_versions,
  notification_templates, outbox_events, platform_error_reports,
  platform_runtime_heartbeats, recording_consents, release_compatibility_reports,
  scheduled_job_runs, scheduled_jobs, search_documents, search_index_operations,
  search_query_events, search_reconciliation_runs, search_synonyms,
  service_accounts, slo_measurements, storage_deletion_requests, storage_policies,
  storage_quota_policies, storage_usage_ledger, tenant_release_migration_status,
  tenant_sender_configurations, tenant_storage_namespaces, webhook_deliveries,
  webhook_endpoints, webhook_replay_nonces
TO veza_worker;

GRANT DELETE ON api_idempotency_records, webhook_replay_nonces TO veza_worker;

GRANT UPDATE (updated_at) ON institutions TO veza_worker;

GRANT EXECUTE ON FUNCTION
  app.apply_notification_provider_event(uuid,text,text,text,text,text,text,jsonb,timestamptz),
  app.assert_storage_quota(uuid,bigint), app.current_feature_flags(),
  app.current_tenant_entitlements(), app.current_tenant_id(),
  app.enqueue_media_processing(uuid), app.notification_quiet_end(jsonb,timestamptz),
  app.notification_recipient_hash(text,jsonb),
  app.record_entitlement_denial(text,text,text,text,jsonb,text,uuid),
  app.refresh_core_metrics(uuid,uuid), app.require_owned_enrolment(uuid,uuid),
  app.require_owned_submission_attempt(uuid,uuid),
  app.require_owned_submission_file(uuid,uuid),
  app.upsert_platform_heartbeat(text,text,text,text,text,text,text[],jsonb),
  app.webhook_pattern_matches(text,text)
TO veza_app;

GRANT EXECUTE ON FUNCTION
  app.apply_due_commercial_policy(), app.apply_tenant_plan_assignment(uuid,uuid),
  app.capture_implicit_support_termination(), app.current_tenant_id(),
  app.enforce_support_elevation_approval(), app.enforce_tenant_close_evidence(),
  app.event_pattern_matches(text,text), app.expire_support_sessions(),
  app.prevent_plan_baseline_override(), app.project_active_plan_policy(),
  app.project_release_ring_target()
TO veza_control;

GRANT EXECUTE ON FUNCTION
  app.apply_due_commercial_policy(),
  app.apply_notification_provider_event(uuid,text,text,text,text,text,text,jsonb,timestamptz),
  app.apply_tenant_plan_assignment(uuid,uuid), app.capture_event_reconciliation(text),
  app.claim_export_jobs(text,integer,integer), app.cleanup_api_runtime_records(),
  app.complete_export_job(uuid,text,integer,text,text,bigint,timestamptz),
  app.enqueue_event_consumers(uuid), app.enqueue_media_processing(uuid),
  app.ensure_platform_schedules(), app.evaluate_platform_alerts(),
  app.event_pattern_matches(text,text), app.expire_export_jobs(),
  app.expire_support_sessions(), app.export_document_payload(uuid),
  app.fail_export_job(uuid,text,integer,text,timestamptz),
  app.measure_platform_slos(), app.notification_quiet_end(jsonb,timestamptz),
  app.notification_recipient_hash(text,jsonb),
  app.prepare_media_retention_deletions(integer),
  app.prepare_notification_digests(integer), app.reconcile_media_asset(uuid),
  app.reconcile_notification_delivery_state(), app.reconcile_webhook_delivery_state(),
  app.refresh_core_metrics(uuid,uuid), app.refresh_due_core_metrics(text,integer),
  app.refresh_search_projection(uuid),
  app.upsert_platform_heartbeat(text,text,text,text,text,text,text[],jsonb),
  app.upsert_search_document(uuid,uuid,text,uuid,uuid,text,text,text,text[],text[],jsonb,jsonb,integer,integer),
  app.webhook_pattern_matches(text,text)
TO veza_worker;

COMMIT;
