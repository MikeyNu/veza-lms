# Veza Learning Cloud feature inventory

Status: authoritative implementation inventory.

This inventory lists platform capabilities at atomic feature level. Broad labels such as assessment, people management or tenant administration are not treated as single features. Each small operation, workflow transition, access control, evidence rule, browser surface and operational safeguard is recorded separately.

## Inventory summary

- Total capabilities: **515**
- Domains: **20**
- Implemented surfaces: **514**
- Declared gaps: **1**
- Current declared gap: governed PDF export

The exact feature records live in `qa/features/catalogue`. They are loaded by `qa/features/platform-features.mjs` and validated by `scripts/qa/feature-inventory.mjs`.

| Domain | Capabilities | Catalogue file |
| --- | ---: | --- |
| Identity, authentication and access | 31 | `qa/features/catalogue/01-foundations.json` |
| Institution foundation, structure and activation | 23 | `qa/features/catalogue/01-foundations.json` |
| People, identities, relationships and privacy | 35 | `qa/features/catalogue/01-foundations.json` |
| Catalogue, curriculum and academic governance | 25 | `qa/features/catalogue/02-learning-core.json` |
| Delivery, scheduling, enrolment and completion | 24 | `qa/features/catalogue/02-learning-core.json` |
| Studio authoring, content governance and media preparation | 30 | `qa/features/catalogue/02-learning-core.json` |
| Learner dashboard and course participation | 15 | `qa/features/catalogue/03-learning-operations.json` |
| Assignments, sessions, submissions and uploads | 27 | `qa/features/catalogue/03-learning-operations.json` |
| Rubrics, marking, moderation, gradebook and result release | 26 | `qa/features/catalogue/03-learning-operations.json` |
| Credentials, analytics and governed exports | 24 | `qa/features/catalogue/04-evidence-communications.json` |
| Communications, notifications and provider feedback | 21 | `qa/features/catalogue/04-evidence-communications.json` |
| Governed storage, media delivery, retention and deletion | 23 | `qa/features/catalogue/04-evidence-communications.json` |
| Terminology and localisation | 10 | `qa/features/catalogue/05-platform-services.json` |
| Search, cache, APIs and service integrations | 19 | `qa/features/catalogue/05-platform-services.json` |
| Tenant provisioning, lifecycle, support and data governance | 28 | `qa/features/catalogue/05-platform-services.json` |
| Commercial policy, feature flags and release governance | 23 | `qa/features/catalogue/06-control-runtime.json` |
| Event schemas, outbox, consumers, schedules and workers | 27 | `qa/features/catalogue/06-control-runtime.json` |
| Observability, security and operational assurance | 29 | `qa/features/catalogue/06-control-runtime.json` |
| Web application, BFF and shared interface system | 49 | `qa/features/catalogue/07-experience-engineering.json` |
| Build, deployment, database change and recovery | 26 | `qa/features/catalogue/07-experience-engineering.json` |

## Architecture rules applied

1. Browser requests never provide a trusted tenant identifier.
2. Tenant context is resolved from validated membership and enforced again through PostgreSQL row-level security.
3. Application, control-plane, worker and migration database identities remain separate.
4. Consequential mutations are transactional and append audit and outbox evidence.
5. Approved, published, released and issued records are immutable and corrected through superseding evidence.
6. Privileged actions require explicit authorization and MFA assurance.
7. Feature and entitlement evaluation is performed by trusted server-side code.
8. Database recovery uses backup restoration followed by forward remediation.
9. Browser surfaces use the shared Veza interface system and preserve accessible semantics.

## What the inventory gate verifies

The executable gate validates that:

- every feature ID is unique and belongs to its declared domain
- every domain has implementation surfaces and verification owners
- critical capabilities such as assignment-session start, tenant activation, MFA and PDF export cannot disappear silently
- every referenced implementation and test path exists
- the catalogue does not shrink below the accepted capability floor
- every NestJS controller operation is discovered
- every web and control-plane page is discovered
- every BFF route and supported HTTP method is discovered
- every worker source capability is discovered
- duplicate discovered routes or feature IDs fail the build
- machine-readable QA artifacts are produced for audit and release review

## Assignment-session runtime evidence

The assignment-session suite directly exercises the production `LearnerSubmissionService` boundary. It verifies:

- an authenticated learner can start an individual assignment session only through an owned active enrolment
- a group assignment requires a current group membership
- effective attempt limits include approved accommodations
- incomplete uploads or files without a clean malware result cannot be finalised
- finalisation creates an immutable content snapshot, receipt number and SHA-256 receipt checksum
- late submission state is computed from the persisted due date
- successful start and finalisation append matching audit and outbox evidence

## PDF export finding

The current academic export request supports CSV and JSON. It records a queued export job and completion evidence, but there is no PDF format in the request contract and no worker PDF renderer. The catalogue therefore marks PDF export as a gap instead of presenting it as implemented.

A production-ready PDF capability must include deterministic rendering, worker execution, governed object persistence, checksum evidence, expiry, authorised retrieval and failure remediation. Merely adding `pdf` to the request enum would not satisfy the architecture.

## Acceptance rule

A feature is not accepted because its page, route, database table or source-text test exists. Production acceptance requires the applicable runtime, PostgreSQL, browser, accessibility, visual, security, migration and smoke evidence for the exact commit.

GitHub currently creates the quality jobs but does not allocate runners because the repository owner account is locked by a billing issue. Remote pass evidence cannot be claimed until that external lock is resolved and the required jobs complete successfully.
