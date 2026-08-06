# Veza platform completion and UX hardening plan

Status: active implementation plan

## Objective

Complete the remaining operational, CRUD, workflow and interface gaps without weakening Veza's tenant, evidence, identity or release architecture. Every implementation tranche must include the applicable API contract, authorization boundary, browser workflow, loading and failure states, automated evidence and responsive QA.

## Inspection findings

1. `scheduled_jobs` already uses `UNIQUE NULLS NOT DISTINCT (tenant_id, job_key)`. The global schedule upsert in migration `0053_platform_schedule_reconciliation.sql` uses a partial-index conflict target that does not match this constraint and must be corrected to the canonical two-column target.
2. Browser authentication correctly delegates credentials to OIDC. Veza must not collect or reset institutional passwords locally.
3. The current sign-in screen has a two-panel foundation but still presents a generic identity experience and duplicates layout markup across workspace-selection and access-pending screens.
4. The API exposes secure invitation acceptance, but the institutional browser does not provide a complete invitation journey.
5. Password and account recovery need a branded handoff to the configured identity provider rather than a local password form.
6. Page-level loading, route errors, retry controls and empty states are inconsistent across application areas.
7. People administration supports CSV onboarding but does not support safe selection-based bulk lifecycle actions.
8. Other high-volume areas require a deliberate bulk-action review. Bulk actions are appropriate for people lifecycle, enrolment lifecycle, invitation revocation or resend, marking allocation and communication recipient preparation. They are not appropriate for curriculum approval, certificate issuance, merge decisions or other individually governed actions without explicit per-record evidence.
9. CRUD completeness cannot be inferred from route counts. Each managed aggregate needs create, read, amend or supersede, lifecycle transition, authorization, concurrency, audit and failure evidence appropriate to that aggregate.
10. Several browser features implement local modal, status and action patterns instead of shared primitives.

## Architecture rules

- The browser never supplies a trusted tenant identifier.
- Membership selection remains the browser authority selector.
- OIDC owns credentials, MFA and account recovery.
- Consequential changes require scoped permission, optimistic concurrency where applicable, audit evidence and outbox evidence.
- Published, approved, released and issued records use lifecycle transitions or superseding evidence, not destructive edits.
- Bulk commands are bounded, transactional where atomicity is required, idempotent where retries are expected and explicit about partial success where atomicity is not valid.
- Application, worker, control-plane and migration database identities remain separate.
- Shared UI primitives own recurring interaction, loading, error, selection and confirmation behaviour.

## Implementation sequence

### Phase 1: operational correctness

- Correct platform schedule reconciliation conflict handling.
- Add migration regression checks for every `ON CONFLICT` target used against `scheduled_jobs`.
- Preserve runtime schedule reconciliation and ownership evidence.

### Phase 2: identity and access journeys

- Build a shared identity gateway layout with a meaningful institutional multi-panel composition.
- Rework sign-in, workspace selection and access-pending screens on the shared layout.
- Add invitation preview and acceptance pages plus same-origin BFF commands.
- Add account-help and reset-password handoff pages that redirect only to configured trusted identity-provider URLs.
- Add safe return-path handling, bounded query parsing, no-store responses and actionable failure states.
- Add loading and error boundaries for all identity routes.

### Phase 3: shared interaction foundations

- Add shared skeleton, route-error, empty-state, selection-toolbar, confirmation and async-action primitives.
- Standardise disabled, submitting, success and retry behaviour.
- Add accessible live regions, focus management and reduced-motion handling.

### Phase 4: CRUD and lifecycle audit

For every managed aggregate, map:

- collection read
- record read
- create
- amend or supersede
- lifecycle transition
- archive or retirement behaviour
- permission and MFA requirements
- optimistic concurrency
- audit and outbox evidence
- browser entry point
- loading, empty and failure states
- automated evidence

Fail the quality gate when a declared managed aggregate lacks an explicit lifecycle decision.

### Phase 5: bounded bulk operations

Implement only where volume and governance justify it:

- people status changes
- enrolment withdrawal or cancellation
- invitation revoke or resend
- marker allocation
- communication recipient preparation

Every bulk command must cap record count, reject duplicate identifiers, use per-record expected versions where required, return structured results and avoid hidden destructive behaviour.

### Phase 6: user-flow completion

Test complete journeys, not isolated screens:

- invitation to authenticated membership to workspace selection
- sign-in failure to account help to retry
- first institution setup to activation
- person creation or import to learner or staff profile to enrolment
- curriculum authoring to review to approved offering
- course-run setup to enrolment to learning participation
- assignment publication to attempt to upload to receipt to marking to release
- certificate eligibility to issue to public verification to revocation
- governed export request to rendering to checksum-verified download to expiry

### Phase 7: responsive and visual QA

- Desktop, tablet and mobile layouts
- Keyboard-only workflows
- Screen-reader landmarks and status announcements
- Zoom and text reflow
- Loading, empty, degraded, denied and error states
- Brand colour ownership and typography
- Full-page real-estate use without unnecessary cards
- No generic SaaS artwork, rainbow palettes, decorative sparkle icons or prohibited em dashes

## Acceptance

A tranche is complete only when its architecture contract, runtime implementation, browser flow, responsive behaviour and automated evidence are committed to `main`. Remote production acceptance still requires successful GitHub quality jobs for the exact commit.