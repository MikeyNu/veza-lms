# Security policy

Report suspected vulnerabilities privately to the repository owner. Do not open public issues containing secrets, personal information, exploit details, invitation tokens or tenant data.

## Trust boundaries

- Tenant identity is derived from a verified principal and active persisted membership. Browser-supplied tenant identifiers are never authoritative.
- Application SQL runs through transaction-local tenant context and forced PostgreSQL row-level security.
- Migration, control-plane, application and event-worker database identities are separate. Runtime services never use the migration owner.
- The event-worker identity may bypass RLS only to lease and acknowledge `outbox_events`; it receives no general tenant-table grants.
- Scoped authorisation denies by default. Explicit deny assignments take precedence while their conditions apply.
- Platform-operator access requires the verified operator role and configured authentication-method assurance, defaulting to MFA.
- Institutional and control-plane browser applications use distinct OIDC clients, redirect URIs, encryption keys and HttpOnly sessions.
- State-changing BFF routes require a same-origin request, validated content type and bounded payload.
- Access tokens remain server-side and must never be serialised into browser responses or client-visible storage.
- Invitation tokens are one-time secrets. Persist only digests; encrypt the delivery payload and compare digests in constant time.
- Consequential changes append immutable audit evidence and transactional outbox events.
- Production outbox delivery uses EventBridge. The local stdout transport is blocked from production startup and never logs event payloads.

## Engineering requirements

- No production or customer-derived data in local, test or preview environments.
- Secrets come from managed secret stores in deployed environments and must not be committed.
- Runtime API responses crossing trust boundaries require explicit validation and bounded size.
- Every new tenant-owned table requires forced RLS, explicit grants and cross-tenant denial tests.
- Privileged support access must be purpose-bound, time-bounded and audited.
- Dead-letter requeue must be an authenticated, reasoned and audited operator action rather than a direct database update.
- Dependency, code, secret and infrastructure scanning remain required CI gates once the repository runner is operational.
