# PI-02 QA record

## Completed locally

- 37 source-level security, contract, architecture and UX tests pass, plus 2 executable authorisation-policy tests: 39 of 39 total.
- Strict TypeScript compilation passes for the API, institutional workspace, control plane and shared packages through the local QA harness.
- OIDC state, nonce, S256 PKCE, authorized-party validation, encrypted cookie size limits and local return-path validation are covered.
- Workspace discovery is bound to the authenticated principal and returns only active memberships with active role assignments.
- Workspace opening fails closed when the role set is empty or the mandatory `core` entitlement is unavailable.
- Platform-operator bootstrap requires both the verified operator role and the configured authentication-method assurance, defaulting to MFA.
- Privileged browser writes require same-origin JSON requests, bounded request and response bodies, server-held tokens and runtime-validated upstream contracts.
- The institutional workspace exposes only role- and entitlement-permitted navigation, and every rendered destination resolves through a guarded route.
- The control-plane navigation marks later work as planned and non-interactive instead of presenting false functionality.
- The foundation dashboard has an explicit responsive bento hierarchy, semantic status treatment, visible focus states and reduced-motion handling.
- Source hygiene checks reject fabricated live weather, malformed evidence markup, placeholder links in authenticated workspace routes, and unresolved TODO or FIXME markers.

## External validation still required

- PostgreSQL integration tests proving cross-tenant denial under the real runtime roles and RLS policies.
- Browser-rendered visual regression at desktop, compact desktop, tablet and mobile breakpoints.
- End-to-end OIDC tests against the selected identity provider, including MFA assurance and expired-session recovery.
- Delivery-worker integration tests proving encrypted invitation payload handling and exactly-once observable outcomes across retries.
- Remote CI execution after the repository's GitHub-hosted runner issue is resolved.
