# PI-02 implementation progress

This branch implements the tenant and access foundation described in `docs/architecture/pi-02-tenant-access-flow.md`.

## Completed trust boundaries

- OIDC Authorization Code with S256 PKCE for the institutional and control-plane browser applications.
- Encrypted, HttpOnly BFF session cookies with bounded lifetimes and distinct application keys.
- Membership-derived workspace selection through opaque membership identifiers; tenant IDs are never accepted from the browser as authority.
- Active-role and mandatory-core-entitlement checks before a workspace can open.
- Runtime validation and size bounds for identity, workspace and provisioning API responses.
- Role- and entitlement-adaptive navigation with guarded destinations only.
- Honest institutional readiness states that do not invent academic records before the academic core exists.
- Separate control-plane authentication, shell and idempotent tenant-provisioning workflow.
- Verified platform-operator bootstrap requires the configured MFA assurance and creates global audit evidence.
- Same-origin, JSON-only and bounded-body enforcement for state-changing BFF routes.
- Forced PostgreSQL RLS for tenant-owned data and separate migrator, application and control-plane identities.
- Transactional audit and outbox evidence for tenant provisioning and invitation workflows.

## Verification gates

- 39 of 39 local source, contract, security, UX and executable authorisation tests pass.
- Strict TypeScript compilation passes through the repository QA harness.
- Source hygiene rejects fabricated live information, malformed markup, unresolved placeholder links and TODO/FIXME markers in implemented surfaces.
- Cross-tenant PostgreSQL integration tests, browser visual regression and identity-provider end-to-end tests remain required when disposable infrastructure is available.

## Next implementation gate

PI-03 introduces institution structure and academic time: institutions, campuses, organisational units, academic periods, policy configuration and the activation checklist that moves a tenant from `provisioning` to `active`.
