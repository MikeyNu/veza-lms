# PI-02 tenant and access flow

## 1. Tenant provisioning

A Veza platform operator submits the institution contract boundary, deployment tier, residency region, plan, enabled modules and first owner email from the separate control-plane workspace. The BFF keeps the operator token HttpOnly. The API requires the platform-operator claim and a strong idempotency key.

Inside one control-plane transaction the service:

1. reserves the idempotency key and hashes the canonical request;
2. verifies the commercial plan is active;
3. creates the tenant in `provisioning` state;
4. materialises module entitlements;
5. creates a one-time owner invitation using a token digest and encrypted delivery payload;
6. appends audit evidence;
7. appends tenant and invitation outbox events; and
8. stores the stable response against the idempotency record.

A repeated request with the same key and body returns the original response. Reusing the key for a different body is rejected.

## 2. Owner activation

The invitation recipient authenticates with the configured identity provider. Veza requires a verified email claim, locks the invitation row, compares the token digest and email, then creates or updates the global user and tenant membership. The baseline tenant-owner role is assigned at tenant scope. Invitation consumption, membership activation, audit evidence and the outbox event commit atomically.

## 3. Workspace selection

After login, a user selects one of their memberships. The selector is a membership UUID, not a tenant UUID. The API resolves it using both membership ID and authenticated user ID, requires active membership validity and an available tenant, then loads role assignments and current entitlements.

The resulting workspace session contains only public tenant, principal, membership and entitlement summaries. Internal policy assignments remain server-side.

## 4. Application requests

Middleware establishes correlation and authentication first. When a membership is selected, it installs the derived tenant context in `AsyncLocalStorage`. Guards then enforce authentication, active membership and scoped policy permission. Repository work opens a transaction and sets the same tenant ID into PostgreSQL transaction-local state before querying RLS-protected tables.

## 5. Audit inspection

Users with `audit.read` can list their tenant's evidence through deterministic cursor pagination. Filters are validated and bound as SQL parameters. Results are ordered by `(occurred_at DESC, id DESC)`, page size is capped at 100 and the endpoint has no control-plane query path.

## 6. Browser authentication and workspace selection

Both browser applications use Authorization Code with PKCE through server-side BFF routes. The browser receives only encrypted, HttpOnly, same-site session cookies. State, nonce and PKCE verifier values are stored in a short-lived authenticated-encryption transaction cookie and validated before token exchange.

The institutional workspace calls `GET /v1/session/workspaces` after authentication. This endpoint derives choices from the authenticated internal user and returns opaque membership IDs with safe tenant summaries. The selection route rechecks the submitted membership against that authenticated list before setting the HttpOnly membership cookie. A tenant ID is never accepted from the browser as authority.

The control plane uses a distinct OIDC client and encryption key. Its callback calls `GET /v1/session/principal`, which requires the verified `veza:platform-operator` claim and the configured authentication-method assurance, defaulting to MFA. Control-plane access does not require or create a tenant membership.
