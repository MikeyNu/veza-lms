# Quality engineering runtime gates

Status: implemented in the `quality` workflow.

This specification converts the architecture guard suite into executable production gates. Source-text checks remain useful for fast architectural drift detection, but they are not accepted as evidence of runtime behaviour on their own.

## Architecture alignment

The test topology preserves the documented boundaries:

- Browser requests never provide trusted tenant identifiers.
- Application queries execute through `veza_app` with forced PostgreSQL row-level security.
- Control-plane, worker and migration identities remain separate.
- Tenant activation is computed from persisted facts and is committed under a tenant lock.
- Consequential writes remain transactional with audit and outbox evidence.
- Database change recovery uses backup restoration and forward remediation. Destructive down migrations are not introduced.
- Browser verification uses the shared `@veza/ui` design system, the documented keyboard contract and the existing deterministic component baseline.

## Required CI jobs

The branch protection policy must require these exact checks:

1. `1. Formatting and linting`
2. `2. Type checking`
3. `3. Unit and domain invariant tests`
4. `4. Contracts, BFF and authentication tests`
5. `5. PostgreSQL repositories, RLS and concurrency`
6. `6. Migration, backup, restore and remediation`
7. `7. Browser, accessibility and visual regression`
8. `8. Production builds`
9. `9. Dependency and secret scanning`
10. `10. Container and infrastructure scanning`
11. `11. Ephemeral preview deployment`
12. `12. Smoke, load, upload and failure-mode tests`

Every dependency installation uses the committed lockfile with `--frozen-lockfile`.

## Runtime coverage matrix

| Required evidence | Executable coverage |
| --- | --- |
| Unit tests for domain invariants | `apps/api/tests/runtime/domain-invariants.test.mjs` exercises tenant activation against durable readiness facts, policy requirements, audit evidence and concurrent status changes. |
| Repository tests against PostgreSQL | Existing API and worker integration suites run against PostgreSQL 17 with real runtime roles. |
| Cross-tenant property tests | `cross-tenant.property.test.mjs` creates generated tenant pairs and proves isolated reads and denied writes for every pair. |
| HTTP controller tests | `scripts/qa/http-contract.mjs` probes live liveness, readiness and not-found behaviour from the built API. |
| BFF route tests | `scripts/qa/bff-contract.mjs` probes same-origin enforcement, media type validation, session enforcement and route allowlisting on the built web application. |
| Contract tests | The contracts package, OIDC BFF, web route contracts and control-plane contracts run in a dedicated job. |
| Browser tests | Playwright executes Chromium, Firefox and WebKit against a production Next.js build. The authenticated PI-03 institution setup route is loaded with an encrypted BFF session, membership context and deterministic API fixtures. Unexpected redirects fail the gate. |
| Accessibility tests | Runtime semantic checks cover landmarks, headings, duplicate IDs, accessible names, form labels, image alternatives and horizontal overflow. |
| Keyboard traversal | Chromium performs tab traversal and verifies visible focus targets and indicators on the authenticated institution setup surface. |
| Visual regression | The existing deterministic UI baseline remains required. Pull requests also render the authenticated institution setup surface and design-system catalogue on the head and base revisions, then compare full-page browser screenshots at desktop and mobile viewports. |
| Concurrency tests | Real PostgreSQL transactions race primary-campus promotion and current policy approval. Exactly one transaction may win. |
| Retry and idempotency | Concurrent idempotency reservation, stable completed-response replay and canonical request mismatch detection run against the control-plane ledger. |
| Upload and reconnect | The built Studio upload BFF is tested through an interrupted ingest, retry at the last acknowledged offset and multi-chunk completion. |
| Load tests | A bounded concurrent load probe records p50, p95, p99 and failure rate for the live API. |
| Backup and restore | A custom-format PostgreSQL backup is restored into a new database and validated with a sentinel and migration ledger count. |
| Migration forward tests | Ordered migrations run through the real `veza_migrator` role, then run a second time without ledger drift. |
| Rollback and remediation | Recovery restores the last known-good backup, preserves object ownership and grants, then executes the forward migration runner against the restored database. |
| Dependency failure | A second API process uses unreachable database endpoints. Liveness remains available and readiness fails closed. |
| Security tests | Real RLS denial, runtime role assertions, signed OIDC verification, signed API MFA step-up enforcement, session expiry, BFF origin checks, dependency review, package audit, Gitleaks, high-confidence secret scanning, Trivy container scans and Trivy IaC scans are required. |
| Preview deployment | Production build artifacts are installed into an isolated PostgreSQL-backed runtime and must expose ready API and browser endpoints. |
| Smoke tests | The exact production artifacts are redeployed and exercised through API, BFF, upload, load and failure-mode probes. |

## MFA and session evidence

The OIDC BFF runtime suite performs an authorization-code exchange against a local signed RSA provider with published JWKS. The resulting token is validated cryptographically, creates an encrypted browser session and is proven unusable after expiry.

The API assurance suite exercises the production `PrincipalVerifier`, `MfaGuard` and platform-operator assurance function. A signed access token carrying the platform-operator role with `amr: ["pwd"]` is verified but rejected from the privileged boundary. A second signed token carrying `amr: ["pwd", "mfa"]` is verified and accepted. This proves the application-side step-up enforcement path rather than only inspecting token source text.

Deployment-specific identity-provider challenge presentation, enrolment and recovery flows must additionally be validated in each environment before go-live because those settings live outside this repository.

## Artifacts

The workflow retains:

- PostgreSQL and migration diagnostics
- backup images and forward-remediation logs
- desktop and mobile browser screenshots
- browser accessibility findings
- visual comparison ratios and difference images
- production build outputs
- preview manifests and service logs
- smoke logs and load percentiles

Artifacts are uploaded even when a gate fails where the job can safely do so.

## Acceptance rule

A change is not production-ready because the test files exist. It is production-ready only when all twelve remote jobs pass for the exact commit and branch protection prevents bypass.
