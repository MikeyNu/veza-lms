# PI-02 implementation progress

This branch implements the tenant and access foundation described in `docs/architecture/pi-02-tenant-access-flow.md`.

## Completed trust boundaries

- OIDC Authorization Code with S256 PKCE for the institutional and control-plane browser applications.
- Encrypted, HttpOnly BFF session cookies with bounded lifetimes.
- Membership-derived workspace selection through opaque membership identifiers; tenant IDs are never accepted from the browser as authority.
- Active-role and mandatory-core-entitlement checks before a workspace can open.
- Role- and entitlement-adaptive navigation with guarded destinations only.
- Separate control-plane authentication and provisioning surface.
- Verified platform-operator bootstrap requires the configured MFA assurance and creates global audit evidence.
- Same-origin, JSON-only and bounded-body enforcement for state-changing BFF routes.
- Forced PostgreSQL RLS for tenant-owned data and separate migrator, application and control-plane identities.

## Verification gates

- Source-level security and architecture tests.
- Strict TypeScript compilation through the repository QA harness.
- Runtime authorisation policy tests against emitted JavaScript.
- Cross-tenant PostgreSQL integration tests and browser visual regression remain required once a disposable database and browser runner are available.
