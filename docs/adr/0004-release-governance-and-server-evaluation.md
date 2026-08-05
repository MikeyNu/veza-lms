# ADR 0004: Release governance and server-side capability evaluation

## Status
Accepted for the platform foundation.

## Context
Veza needs controlled rollout across internal validation, design partners, preview institutions and general availability. A browser-only flag library would allow navigation or client state to become authoritative, would expose global rollout configuration, and would not enforce tenant entitlements consistently.

## Decision
Release rings, feature definitions, ring configuration, tenant assignments and tenant overrides are control-plane records. The `veza_control` identity may inspect and mutate those records through guarded services; the `veza_app` identity receives no direct table privileges.

Application code evaluates active flags through the `app.current_feature_flags()` security-definer function inside a tenant transaction. The function has no tenant argument and derives the tenant only from `app.current_tenant_id()`. It returns no rows when transaction-local tenant context is absent.

Evaluation precedence is:

1. required module entitlement can force the capability off;
2. tenant override;
3. release-ring configuration;
4. feature default.

Every configuration record carries a version for optimistic concurrency. Consequential mutations require a normalized operational reason, idempotency, MFA-verified platform-operator access and immutable audit evidence.

## Consequences
- Feature decisions remain server authoritative and reproducible.
- Application database credentials cannot enumerate fleet rollout configuration.
- Missing tenant context fails closed rather than falling back to general availability.
- Entitlements remain a harder boundary than feature rollout.
- Future modules can inject `FeatureFlagService` without depending on the control-plane domain model.
