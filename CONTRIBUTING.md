# Contributing

## Branches and commits

Use focused branches and conventional commits. Preserve user-supplied architecture and brand references. A change is not complete until its tests, accessibility impact, tenant-isolation impact, operational impact and documentation have been considered.

## Required checks

- formatting and source hygiene
- lint and strict type checking
- unit, contract and executable policy tests
- production build when dependencies and runners are available
- keyboard, focus, responsive and reduced-motion review for changed product surfaces
- runtime validation for responses crossing process or trust boundaries
- cross-tenant denial tests for database or repository changes

Do not weaken a gate to obtain a green build. Diagnose the failure, record external infrastructure blockers explicitly, and keep unverified claims out of the pull request.

## Architectural boundaries

Applications may depend on packages. Domain packages must not import applications. Backend bounded contexts communicate through published interfaces or domain events, never another context's repositories.

Browser code must not hold access tokens or tenant authority. BFF routes mediate authenticated calls. Tenant-owned repositories require a derived request context and transaction-local RLS context.

## Product and design quality

- Every surface must support a real user decision, task or institutional control.
- Do not populate production states with invented learner records, metrics, weather, notifications or deadlines.
- Planned capabilities must be marked unavailable rather than linked to empty or misleading destinations.
- Use semantic design tokens and preserve the Veza brand hierarchy: quiet canvas, dark institutional navigation, restrained violet emphasis and status colours only for meaning.
- Empty, loading, error, permission-denied and partial-data states are part of the feature, not follow-up polish.
