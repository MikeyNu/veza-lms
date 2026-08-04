# PI-02 QA record

## Completed locally

- 31 source-level security, contract and UX tests pass, plus 2 executable authorisation-policy tests.
- Strict TypeScript compilation passes for the API, institutional workspace, control plane and shared packages through the local QA harness.
- OIDC state, nonce, S256 PKCE, authorized-party validation, encrypted cookie size limits and local return-path validation are covered.
- Workspace discovery is bound to the authenticated principal and returns only active memberships with active role assignments.
- Workspace opening fails closed when the role set is empty or the mandatory `core` entitlement is unavailable.
- Privileged browser writes require a same-origin JSON request and bounded request body.
- Access tokens remain server-side in encrypted HttpOnly sessions and are not serialized into browser responses.

## External validation still required

- PostgreSQL integration tests proving cross-tenant denial under the real runtime roles and RLS policies.
- Browser-rendered visual regression at desktop, compact desktop, tablet and mobile breakpoints.
- End-to-end OIDC tests against the selected identity provider.
- Remote CI execution after the repository's GitHub-hosted runner issue is resolved.
