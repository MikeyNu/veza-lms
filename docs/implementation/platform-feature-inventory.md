# Veza Learning Cloud feature inventory

Status: authoritative implementation inventory

This inventory records platform capabilities at atomic level. Broad labels such as assessment, people management or tenant administration are not treated as single features. Commands, queries, lifecycle transitions, access controls, evidence rules, browser surfaces, worker execution and operational safeguards are recorded independently.

## Inventory summary

- Total capabilities: **561**
- Domains: **24**
- Declared gaps: **0**
- Governed aggregate models: **56**
- End-to-end workflows: **12**

The exact feature records live in `qa/features/catalogue`. They are loaded by `qa/features/platform-features.mjs` and validated by `scripts/qa/feature-inventory.mjs` plus `scripts/qa/workflow-completeness.mjs`.

| Domain | Capabilities | Catalogue file |
| --- | ---: | --- |
| Identity, authentication and access | 31 | `01-foundations.json` |
| Institution foundation, structure and activation | 23 | `01-foundations.json` |
| People, identities, relationships and privacy | 35 | `01-foundations.json` |
| Catalogue, curriculum and academic governance | 25 | `02-learning-core.json` |
| Delivery, scheduling, enrolment and completion | 24 | `02-learning-core.json` |
| Studio authoring, content governance and media preparation | 30 | `02-learning-core.json` |
| Learner dashboard and course participation | 15 | `03-learning-operations.json` |
| Assignments, sessions, submissions and uploads | 27 | `03-learning-operations.json` |
| Rubrics, marking, moderation, gradebook and result release | 26 | `03-learning-operations.json` |
| Credentials, analytics and governed exports | 25 | `04-evidence-communications.json` |
| Communications, notifications and provider feedback | 21 | `04-evidence-communications.json` |
| Governed storage, media delivery, retention and deletion | 23 | `04-evidence-communications.json` |
| Terminology and localisation | 10 | `05-platform-services.json` |
| Search, cache, APIs and service integrations | 19 | `05-platform-services.json` |
| Tenant provisioning, lifecycle, support and data governance | 28 | `05-platform-services.json` |
| Commercial policy, feature flags and release governance | 23 | `06-control-runtime.json` |
| Event schemas, outbox, consumers, schedules and workers | 27 | `06-control-runtime.json` |
| Observability, security and operational assurance | 29 | `06-control-runtime.json` |
| Web application, BFF and shared interface system | 49 | `07-experience-engineering.json` |
| Build, deployment, database change and recovery | 26 | `07-experience-engineering.json` |
| Institutional and operator identity journeys | 14 | `08-platform-completion.json` |
| Institutional access administration completion | 12 | `08-platform-completion.json` |
| Bounded bulk lifecycle operations | 8 | `08-platform-completion.json` |
| Shared loading, error and workflow resilience | 11 | `08-platform-completion.json` |

## Architecture rules applied

1. Browser requests never provide a trusted tenant identifier.
2. Tenant context is resolved from validated membership and enforced again through PostgreSQL row-level security.
3. OIDC owns passwords, MFA and account recovery. Veza never collects institutional passwords.
4. Application, control-plane, worker and migration database identities remain separate.
5. Consequential mutations are transactional and append audit and outbox evidence.
6. Approved, published, released and issued records are immutable and corrected through superseding evidence.
7. Privileged actions require explicit authorization and the required authentication assurance.
8. Feature and entitlement evaluation is performed by trusted server-side code.
9. Database recovery uses backup restoration followed by forward remediation.
10. Browser surfaces use shared Veza interaction patterns and preserve accessible task order at desktop and mobile widths.

## Feature, CRUD and workflow gates

The quality system now validates three related inventories:

- `scripts/qa/feature-inventory.mjs` discovers API operations, BFF routes, browser pages and worker source capabilities. Implemented browser capabilities may declare an `entryPoint`; the gate resolves the actual Next.js page tree and fails when that declared route does not exist. This prevents a navigation control or source component from being counted as a complete browser feature when its destination is missing.
- `scripts/qa/crud-lifecycle.mjs` requires explicit create, read, amendment, lifecycle, retirement, deletion and bulk-operation decisions for 56 governed aggregates.
- `scripts/qa/workflow-completeness.mjs` verifies 12 complete user journeys with entry conditions, terminal outcomes, implementation paths, test owners and degraded states.

The browser entry point catalogue currently binds core workspaces such as profile self-service, communications, learning, assessment, evidence, insights, people, Studio, workspace selection and institution setup to real application routes. Dynamic routes are validated against their canonical route pattern rather than a fabricated example identifier.

The CRUD registry prohibits destructive hard deletion for governed academic, identity and people records. Published or issued evidence is retired, revoked, expired, ended or superseded according to its aggregate lifecycle.

## Bounded bulk policy

Bulk actions are implemented only where the records share one safe invariant and the command can preserve authorization and evidence:

- People records support bounded atomic active or inactive status changes with per-record expected versions, MFA, audit and outbox evidence. Merged and deceased records are excluded.
- Active membership invitations support bounded atomic revocation. Each selected invitation is rechecked for active state and delegation authority.

Bulk operation is intentionally prohibited for curriculum approval, certificate issuance or revocation, person merge, learner-result release, enrolment transfer or reinstatement, support elevation and other record-specific decisions.

## Identity and access completion

The institutional application now includes:

- a shared multi-panel identity gateway
- OIDC-only sign-in with an optional email hint
- account-help and password-recovery handoff to configured trusted identity-provider URLs
- invitation rendering, sign-in return, atomic acceptance and workspace installation
- workspace selection and access-pending states
- route-level skeletons and recoverable error boundaries
- an institutional access-administration workspace for invitation creation, resend, revocation, membership status, role assignment and role termination
- a personal `/profile` workspace for authenticated identity details, current membership, institution switching, communications preferences, account guidance and sign-out while password and MFA controls remain with the identity provider

The control plane uses a separate multi-panel operator gateway and communicates the separate OIDC client, platform role, MFA assurance and tenant-content boundary.

## Communications experience boundary

The institutional communications surface is role-adaptive. Tenant owners and institution administrators use the operational communications workspace for templates, sender trust, delivery diagnostics and suppressions. Other workspace members use a principal-scoped recipient workspace that queries notifications only when the notification intent targets the current authenticated user or a person currently linked to that user. Recipient delivery preferences are written against the authenticated actor through the existing same-origin BFF and cannot nominate another user identifier.

## Assignment-session runtime evidence

The assignment-session suite exercises the production learner submission boundary. It verifies:

- an authenticated learner can start an individual assignment session only through an owned active enrolment
- a group assignment requires a current group membership
- effective attempt limits include approved accommodations
- incomplete uploads or files without a clean malware result cannot be finalised
- finalisation creates an immutable content snapshot, receipt number and SHA-256 receipt checksum
- late submission state is computed from the persisted due date
- successful start and finalisation append matching audit and outbox evidence

## Governed export lifecycle

PDF, CSV and JSON exports use one asynchronous governed lifecycle:

- authorised request and validated filters
- lease-safe worker claim
- tenant-scoped payload generation
- deterministic rendering
- governed object persistence
- SHA-256 completion evidence
- authorised status and download routes
- checksum verification before bytes are returned
- bounded retry and terminal failure evidence
- automatic object expiry with retained metadata evidence

Browser clients cannot assert export completion. Only the worker can transition a persisted export to ready.

## Browser QA scope

The browser harness covers public, OIDC-only and workspace routes across Chromium, Firefox and WebKit at desktop and mobile widths. It checks:

- expected redirect boundaries
- one main landmark and one page heading
- labelled controls and duplicate IDs
- keyboard reachability and visible focus
- horizontal overflow
- local password non-collection
- console, page and request failures
- deterministic screenshots and optional pixel comparison

The visual identity diagrams are implemented as responsive CSS and inline SVG instead of generated bitmap artwork. This avoids additional asset weight, preserves sharpness at every viewport and keeps the visual tied to live interface semantics. No generated raster asset was necessary for these screens.

## Acceptance rule

A page, route, table or source-text test alone does not establish production acceptance. The exact release commit must pass the applicable runtime, PostgreSQL, browser, accessibility, visual, security, migration, backup and smoke evidence.

GitHub currently creates the quality jobs but has previously refused to allocate runners because the repository owner account is locked by a billing issue. Remote pass evidence must not be claimed until the external lock is resolved and the required jobs complete for the exact commit.
