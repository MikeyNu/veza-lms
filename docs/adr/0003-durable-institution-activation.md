# ADR 0003: Durable institution activation

- Status: accepted
- Date: 2026-08-04
- Decision owners: product architecture, platform engineering and security

## Context

A provisioned tenant is not yet safe to open to learners. Identity, support, privacy, academic time, institutional accountability and policy evidence must exist before learning delivery begins. A client-side checklist or manually stored completion flag would allow presentation state to drift from durable institutional facts.

## Decision

Veza computes tenant activation readiness from persisted, tenant-scoped records at request time. The browser renders the resulting evidence but cannot mark a requirement complete.

A tenant can transition from `provisioning` to `active` only when the activation transaction confirms:

1. the tenant is still in `provisioning`;
2. an operational setup profile defines identity mode, support contact, privacy contact, retention and learner-support SLA;
3. the mandatory `core` entitlement is current;
4. at least one active tenant-scoped owner exists;
5. at least one active institution exists;
6. every active institution has exactly one primary active campus;
7. every active institution has a current or future published academic period;
8. every active institution has the required approved and effective policies; and
9. school institutions additionally have an effective safeguarding policy.

The service locks the tenant, reevaluates every fact, updates the status and appends audit and outbox evidence in one transaction. Activation requires tenant-owner permission and MFA.

## Supporting decisions

- Published academic periods are structurally immutable. Corrections use replacement periods rather than rewriting published history.
- Approved policy content is immutable. A changed policy creates a new version, retires the prior effective version and preserves checksums and approval evidence.
- Institution administrators operate only inside institution-scoped assignments. Tenant-wide activation and operational profile controls remain with tenant owners.
- Child academic periods must remain within their parent period, and a parent must be published before a child can be published.

## Consequences

### Positive

- Launch state cannot drift from actual configuration.
- Audit evidence explains why activation was permitted.
- The same readiness contract can drive UI, support, reporting and rollout automation.
- Policy and academic-time history remains trustworthy.

### Trade-offs

- Readiness evaluation performs several bounded aggregate queries.
- Administrators must correct underlying records rather than overriding a failed check.
- Policy replacement and published-period correction require explicit versioning workflows.

## Rejected alternatives

- **Client-side checklist:** unauthoritative and easy to bypass.
- **Single `setup_complete` flag:** loses evidence and becomes stale.
- **Automatic activation after first institution creation:** ignores privacy, support, time and policy readiness.
- **Mutable approved policies or published periods:** destroys historical evidence and makes downstream results difficult to reproduce.
