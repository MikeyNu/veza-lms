# PI-02 implementation progress

This branch implements the tenant and access foundation described in `docs/architecture/pi-02-tenant-access-flow.md`.

## Completed trust boundaries

- OIDC Authorization Code with S256 PKCE for the institutional and control-plane browser applications.
- Encrypted, HttpOnly BFF session cookies with bounded lifetimes.
- Membership-derived tenant selection; tenant IDs are never accepted from the browser as authority.
- Role and entitlement-aware workspace sessions and navigation.
- Separate control-plane authentication and provisioning surface.
- Same-origin enforcement for state-changing BFF routes.
- Forced PostgreSQL RLS for tenant-owned data and separate migrator, application and control-plane identities.

## Verification gates

- Source-level security and architecture tests.
- Strict TypeScript compilation through the repository QA harness.
- Cross-tenant database integration tests remain required once the CI runner and disposable PostgreSQL service are available.
