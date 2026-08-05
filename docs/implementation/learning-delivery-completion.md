# Learning delivery completion

The `agent/mvp-learning-delivery` tranche completes implementation gates 6.4 through 6.9 and the associated hardening work.

## Completed boundaries

- Course offerings, overlays, capacity, waitlists, timetable conflicts, effective-dated enrolment history, transfer and reinstatement
- Veza Studio structured blocks, reusable blocks, assets, autosave revisions, comments, review, accessibility, publishing, rollback and import compatibility
- Learner Today, course room, low-bandwidth delivery, offline manifests, bookmarks, discussions and authoritative progress
- Assignment definitions, accommodations, group membership, attempts, reconnect-safe uploads, malware evidence, immutable receipts, marking, feedback and result release
- Gradebook categories, items, formula versions, impact previews, overrides, published-result correction and separate learner and staff views
- Certificate templates, independent approvals, award evaluation, issuance, public verification and revocation
- Structured exports, core metric definitions, freshness evidence and scheduled refresh execution

## Security controls

- Learner UUID possession is insufficient. PostgreSQL resolves enrolment, attempt and file ownership through `people.linked_user_id`.
- Marker allocations require an active person linked to a user identity. Mark creation must use the allocated identity.
- Reviewed rubrics and certificate templates are immutable.
- Credential issuance requires a persisted eligible award evaluation.
- Published result corrections create new rows and mark previous rows corrected.
- Studio assets require malware and accessibility evidence before ready state.

## Acceptance coverage

Repository tests cover:

- source routing and same-origin BFF allowlists;
- ownership functions;
- approval segregation;
- immutable grade correction;
- metric worker execution;
- learner, Studio and staff workspace integration; and
- complete migration execution under service identities.

GitHub Actions must execute the repository quality workflow before merge. A job with `runner_id: 0`, no runner name and no steps is an infrastructure allocation failure and does not constitute test execution.
