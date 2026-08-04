# ADR 0002: Tenant context, service identities and control-plane separation

- Status: accepted
- Date: 2026-08-04
- Scope: PI-02 tenant, entitlement and identity foundation

## Context

Veza serves unrelated institutions from one SaaS platform. A tenant identifier is therefore a security boundary, not a routing convenience. The system also needs a small number of global operations, including tenant provisioning and resolving an authenticated identity to memberships, that cannot begin inside an already selected tenant.

## Decision

1. The browser never supplies a trusted tenant ID. It supplies an opaque membership selector after authentication. The API resolves that membership together with the authenticated internal user and derives the tenant from persisted data.
2. Tenant-owned application queries execute through `withTenantTransaction`. The transaction sets `app.tenant_id` locally before any domain query and PostgreSQL RLS remains forced on tenant-owned tables.
3. Global provisioning and identity-directory reads use a distinct control-plane database identity. That identity has `BYPASSRLS` and must only be reachable through reviewed, parameterised control-plane repositories and transactions.
4. Schema migration uses a third identity. Neither runtime identity owns or executes migrations.
5. Request context is stored in `AsyncLocalStorage` after membership resolution and fails closed when absent.
6. Authorisation combines permission, scope and conditions. Deny assignments take precedence over allows.
7. Operator credentials remain server-side. The control-plane browser calls a BFF that forwards the HttpOnly operator token to the API.

## Consequences

- A leaked or forged tenant header cannot cross the isolation boundary because no such header is trusted.
- Application-plane SQL receives RLS defence in depth in addition to repository scoping.
- The control-plane identity is high privilege and requires a smaller deployment surface, separate credentials, explicit monitoring and code-owner review.
- Protected and sovereign deployments can move the same control-plane contracts into physically separate services without changing domain semantics.
- Local development requires three database identities: migrator, application and control plane.

## Non-negotiable verification

- Cross-tenant tests must prove that an authenticated user cannot select another user's membership.
- Application-plane tests must exercise forced RLS with the `veza_app` identity.
- No controller or DTO may accept a tenant ID as authority for an application-plane operation.
- Every privileged write must append audit evidence and a transactional outbox event where downstream work is required.
