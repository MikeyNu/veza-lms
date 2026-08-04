# Veza Learning Cloud

Veza is a multi-tenant education operating system for institutions, academies, training providers, schools and learning businesses. The product combines institution operations, curriculum authoring, teaching, assessment, learner support, analytics and credentials in one tenant-aware workspace.

## Repository shape

- `apps/web`: role-adaptive Next.js product workspace
- `apps/api`: NestJS modular monolith and public API
- `packages/ui`: shared design-system primitives and tokens
- `packages/contracts`: versioned API and event contracts
- `packages/authz`: tenant-aware permission policy primitives
- `docs`: architecture decisions, bounded contexts and product design rules

## Foundation rules

1. Tenant context is resolved from a trusted session or service credential, never from an arbitrary request body.
2. Each bounded context owns its domain rules and persistence boundary.
3. Consequential academic records are versioned and auditable.
4. UI surfaces exist to support a decision or task, not to decorate a dashboard.
5. Accessibility, low-bandwidth behaviour and keyboard operation are release requirements.

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

The first vertical slice provides the role-adaptive application shell, tenant context contract, permission primitives, health endpoint and CI quality gates.
