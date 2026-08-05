# Veza Learning Cloud

Veza is a multi-tenant education operating system for institutions, academies, training providers, schools and learning businesses. The product combines institution operations, curriculum authoring, teaching, assessment, learner support, analytics and credentials in one governed workspace.

## Repository shape

- `apps/web`: role-adaptive Next.js institutional workspace
- `apps/control-plane`: separately authenticated tenant provisioning and service-operations workspace
- `apps/api`: NestJS modular monolith and versioned API
- `packages/ui`: shared design-system primitives and semantic tokens
- `packages/contracts`: versioned API, session and event contracts
- `packages/authz`: scoped RBAC and policy-evaluation primitives
- `packages/oidc-bff`: Authorization Code + PKCE and encrypted HttpOnly BFF session primitives
- `docs`: architecture decisions, bounded contexts, operations and product design rules

## Foundation rules

1. Tenant context is derived from a verified identity and active persisted membership, never from a tenant identifier supplied by the browser.
2. Application SQL runs through a tenant transaction and forced PostgreSQL row-level security.
3. Control-plane, application-plane and migration database identities are separate.
4. Scoped authorisation denies by default and explicit deny assignments take precedence.
5. Consequential changes append immutable audit evidence and transactional outbox events.
6. UI surfaces exist to support a decision or task, not to decorate a dashboard.
7. Accessibility, low-bandwidth behaviour and keyboard operation are release requirements.

## Local development

A clean local database volume is required the first time the three service identities are introduced.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm --filter @veza/api db:migrate
pnpm dev
```

Default local ports:

- institutional workspace: `http://localhost:3000`
- Veza control plane: `http://localhost:3001`
- API: `http://localhost:4000/v1`

The OIDC examples in `.env.example` are placeholders. Set `VEZA_DEMO_MODE=true` only for an intentional visual-reference preview; it is disabled by default. Configure distinct web and control-plane clients, redirect URIs and 32-byte base64 session-encryption keys before sign-in can operate.

## Current implementation boundary

The implemented foundation now includes tenant provisioning, plans and module entitlements, secure first-owner invitations, verified OIDC principals, encrypted BFF sessions, safe workspace selection, membership-derived tenant context, scoped policy evaluation, forced RLS, audit inspection and transactional outbox records.

Institution structures, people records and academic entities intentionally remain outside this increment. They depend on this trust boundary and are introduced in the next gated vertical slice.
