# PI-03 implementation progress

This branch implements the institution structure and activation gate defined in `docs/architecture/pi-03-institution-structure-and-time.md`.

## Completed backend foundation

- tenant setup profile for identity mode, privacy, support, retention and learner-support SLA;
- tenant-owned institutions, campuses, organisational units, academic periods and institutional policies;
- tenant-scoped composite foreign keys and forced PostgreSQL row-level security;
- one-primary-campus invariant for active institution delivery context;
- immutable published academic-period structure;
- immutable approved policy content with checksums and effective version replacement;
- child organisational-unit and academic-period containment inside the same institution;
- institution-scoped authorisation with tenant inheritance for tenant owners;
- MFA requirements for operational profile configuration, period publication, policy approval and tenant activation;
- audit and outbox evidence for consequential mutations; and
- durable activation readiness and atomic activation transaction.

## Completed institutional experience

- role-scoped institution setup centre at `/admin/institution-setup`;
- tenant-wide readiness rail for tenant owners;
- scoped institution view for institution administrators;
- operational profile, institution, campus, organisational-unit, academic-period and policy workflows;
- explicit draft-to-published academic-period action;
- immutable policy-version approval workflow;
- boundary inspector based on server-loaded facts;
- responsive three-column bento hierarchy that collapses intentionally for tablet and mobile; and
- navigation and dashboard calls to action linked to the real setup centre.

## Completed browser trust boundary

- server-only institution setup contract loader with runtime validation;
- same-origin, JSON-only and bounded BFF mutation proxy;
- fixed route and method allowlist;
- server-held access token and membership-derived tenant context;
- no browser-supplied tenant authority; and
- credential-shaped payload and upstream-response rejection.

## Verification gates

- 47 of 47 local source, contract, security, architecture, UX, OIDC and executable authorisation tests pass.
- strict TypeScript compilation passes for the API, institutional workspace and shared authorisation package through the local QA harness.
- source hygiene rejects explicit `any`, TypeScript suppression, unresolved TODO/FIXME and browser-supplied tenant headers in the PI-03 paths.
- the setup centre cannot complete a readiness item locally; it renders API-computed activation evidence.

## Remaining external gates

- live PostgreSQL migration and cross-tenant RLS denial tests using real `veza_app` and `veza_control` identities;
- browser-rendered visual regression against the supplied Brand CI at desktop, compact desktop, tablet and mobile widths;
- end-to-end MFA step-up, expired-session recovery and identity-provider behavior;
- concurrent policy-approval and campus-primary-selection integration tests; and
- remote GitHub Actions execution after the repository runner issue is resolved.

## Next implementation gate

PI-04 should introduce people and institutional relationships: person records, staff and learner profiles, organisational assignments, guardian/sponsor relationships, consent boundaries and bulk import foundations. Academic catalogue work can then reference the durable institution, organisational-unit and academic-period identifiers established in PI-03.
