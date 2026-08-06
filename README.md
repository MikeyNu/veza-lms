# Veza Learning Cloud

Veza is a multi-tenant education operating system for institutions, academies, training providers, schools and learning businesses. The product combines institution operations, identity and access administration, people records, curriculum, teaching, assessment, learner support, analytics, credentials and governed platform services in one architecture.

## Repository shape

- `apps/web`: role-adaptive Next.js institutional workspace
- `apps/control-plane`: separately authenticated tenant provisioning and service-operations workspace
- `apps/api`: NestJS modular monolith and versioned API
- `apps/worker`: dedicated transactional-outbox, delivery and scheduled-work process
- `packages/ui`: shared design-system primitives and semantic tokens
- `packages/contracts`: versioned API, session and event contracts
- `packages/authz`: scoped RBAC and policy-evaluation primitives
- `packages/oidc-bff`: Authorization Code with PKCE and encrypted HttpOnly BFF session primitives
- `qa`: authoritative feature, aggregate and workflow inventories
- `scripts/qa`: executable architecture, migration, browser and release gates
- `docs`: architecture decisions, bounded contexts, operations and product design rules

## Foundation rules

1. Tenant context is derived from a verified identity and active persisted membership, never from a tenant identifier supplied by the browser.
2. Application SQL runs through tenant transactions and forced PostgreSQL row-level security.
3. Control-plane, application-plane, worker and migration database identities are separate.
4. Scoped authorisation denies by default and explicit deny assignments take precedence.
5. Consequential changes append immutable audit evidence and transactional outbox events.
6. Approved, published, released and issued evidence is corrected through governed lifecycle transitions or superseding records, not destructive edits.
7. The worker leases and publishes outbox events and executes registered schedules. The API does not perform hidden background delivery.
8. OIDC owns passwords, MFA and account recovery. Veza does not collect institutional passwords.
9. UI surfaces support a decision or task rather than decorating a dashboard.
10. Accessibility, low-bandwidth behaviour, responsive task order and keyboard operation are release requirements.

## Implemented bounded contexts

The current implementation includes:

- tenant provisioning, lifecycle, entitlements, plans and fleet operations
- institutional setup, campuses, organisational structure, academic periods and policy activation
- OIDC sessions, workspace selection, invitations, memberships, roles and scoped access administration
- people, learner and staff profiles, relationships, privacy restrictions, imports and identity linking
- terminology, programme and course definitions, curriculum review and approval
- course runs, offerings, cohorts, classes, timetables, enrolments, waitlists and completion history
- Studio course authoring, revisions, reusable blocks, media registration, review and publication
- learner home, course rooms, progress evidence, bookmarks, discussions and offline synchronization
- assignments, submission sessions, resumable files, malware gates and immutable receipts
- rubrics, marking, moderation, formulas, gradebooks and result publication
- certificate templates, award rules, issuance, revocation and public verification
- PDF, CSV and JSON export jobs with worker rendering, checksums, authorized download and expiry
- communications, notification intent delivery, provider feedback and suppression handling
- governed storage, retention, accessibility metadata, recording consent and deletion approval
- service accounts, webhooks, search projections, cache policy, observability, SLOs and alerts
- control-plane support elevation, release governance, feature flags and commercial policy

The atomic inventory is maintained in `qa/features/catalogue` and summarized in `docs/implementation/platform-feature-inventory.md`.

## Quality governance

The default test command runs the feature, CRUD and workflow gates before package tests:

- `scripts/qa/feature-inventory.mjs` discovers API, BFF, page and worker implementation surfaces.
- `scripts/qa/crud-lifecycle.mjs` validates lifecycle and evidence decisions for managed aggregates.
- `scripts/qa/workflow-completeness.mjs` validates complete user journeys and degraded states.

CI additionally covers formatting, linting, type checking, runtime tests, PostgreSQL RLS, migration repeatability, backup and restore, accessibility, visual regression, production builds, dependency review, secret scanning, infrastructure scanning and smoke evidence.

A page, route, table or source-text test does not establish production acceptance on its own. The exact release commit must complete the applicable runtime, database, browser, accessibility, security, migration and smoke checks.

## Local development

A clean local database volume is required the first time service identities are introduced or changed.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm --filter @veza/api db:migrate
pnpm dev
```

Default local ports:

- institutional workspace: `http://localhost:3000`
- Veza control plane: `http://localhost:3001`
- API: `http://localhost:4000/v1`

The local outbox worker defaults to the metadata-only `stdout` transport. Production startup rejects that transport and requires the configured event transport.

The OIDC examples in `.env.example` are placeholders. Set `VEZA_DEMO_MODE=true` only for an intentional visual-reference preview. Configure distinct web and control-plane clients, redirect URIs and 32-byte base64 session-encryption keys before sign-in can operate.
