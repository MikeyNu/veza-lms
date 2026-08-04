# ADR 0001: Platform foundation

- **Status:** Accepted
- **Date:** 2026-08-04

## Decision

Use a pnpm/Turborepo monorepo containing a Next.js web workspace and a NestJS modular monolith. Shared packages contain UI primitives, contracts and authorisation policy types. Begin with event-ready bounded contexts and a transactional outbox when persistence is introduced; do not start with distributed microservices.

## Rationale

Veza's institutional workflows are transactional and span identity, academic structure, delivery and evidence. A modular monolith preserves consistency and lowers operational failure modes while explicit module ownership keeps future extraction possible.

## Consequences

- Cross-context repository access is prohibited.
- External APIs are REST/OpenAPI by default.
- Tenant context and policy decisions are first-class request metadata.
- Workers will be separate processes but consume versioned contracts.
