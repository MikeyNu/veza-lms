# PI-03 institution structure and academic time

## Purpose

PI-03 turns a commercially provisioned tenant into an institution that can safely proceed toward academic delivery. It introduces the minimum durable organisational, temporal and policy structure required before people, programmes, courses, enrolments or classes can be created.

## Bounded model

```text
Tenant
├── Tenant setup profile
└── Institution
    ├── Campus
    ├── Organisational unit
    │   └── Child organisational unit
    ├── Academic period
    │   └── Child academic period
    └── Institutional policy version
```

### Tenant setup profile

Stores launch-critical tenant settings that are not academic records:

- identity mode: managed, SSO or hybrid;
- support contact;
- privacy contact;
- data-retention duration; and
- learner-support SLA.

Only a tenant owner with MFA can configure this profile.

### Institution

Represents an accountable education provider or independently administered institution within the tenant. The institution defines its type, locale, timezone and institutional contact. Institution codes are unique inside the tenant.

### Campus

A campus is a physical, virtual or hybrid delivery context. Each active institution must have exactly one primary non-archived campus before tenant activation. The primary campus is a delivery default, not a security scope shortcut.

### Organisational unit

Organisational units model faculties, schools, departments, divisions, centres and programme offices. Parent-child relationships are constrained to the same tenant and institution.

### Academic period

Academic periods model academic years, semesters, trimesters, terms, quarters, blocks or custom periods. Child periods must fit inside the parent’s date range. Publication is a consequential MFA-protected action. A child period cannot be published before its parent.

Once published, structural dates and identity fields are immutable. Later timetable, enrolment, assessment and result records may therefore reference a stable period.

### Institutional policy

Policies are approved immutable versions with a content checksum, effective dates and approval evidence. Approving a replacement:

1. takes a transaction-scoped advisory lock for tenant, institution and policy key;
2. verifies the replacement takes effect after the current version;
3. retires the current version on the day before the replacement becomes effective; and
4. creates the next approved version.

## Access model

### Tenant owner

- configure tenant setup profile;
- create institutions;
- configure every institution through inherited tenant scope;
- inspect tenant-wide activation readiness; and
- activate the tenant with MFA.

### Institution administrator

- read and configure only assigned institutions;
- create campuses, units and academic periods within that scope;
- approve institution policy versions with MFA; and
- publish academic periods with MFA.

Institution administrators do not receive tenant-wide profile or activation controls.

### Registrar

The permission model includes academic-period management for future registrar workflows. PI-03 does not yet expose the registrar setup centre because institution-scoped registrar read and operating workflows require the people and academic-catalogue slices that follow.

## Request flow

1. The browser holds only encrypted HttpOnly OIDC and membership cookies.
2. The Next.js server loads setup data using the server-held access token and selected membership.
3. The API derives tenant context from the authenticated principal and persisted membership.
4. Tenant-wide endpoints use tenant permissions.
5. Institution endpoints evaluate the requested institution as the resource, with the tenant as ancestor.
6. Repositories execute inside a tenant transaction with forced PostgreSQL RLS.
7. Consequential mutations append audit and transactional outbox records.

## Browser write mediation

The institution setup BFF accepts only a fixed route and method allowlist. It requires:

- same-origin request;
- JSON content type;
- bounded request and response sizes;
- active encrypted OIDC session;
- valid membership cookie;
- server-held bearer token; and
- rejection of credential-shaped keys in payloads and upstream responses.

No tenant identifier supplied by the browser is authoritative.

## Activation flow

The setup centre renders `TenantActivationReadiness` returned by the API. The final activation endpoint locks the tenant and reevaluates all checks. A stale browser cannot activate a tenant after a required fact changes.

When activation succeeds, the service:

1. changes tenant status from `provisioning` to `active` conditionally;
2. writes immutable audit evidence with the evaluated checks; and
3. writes a `tenant.activated` outbox event in the same transaction.

## Explicit non-goals

PI-03 does not create:

- learner or staff records;
- programmes or course catalogues;
- enrolments or cohorts;
- classes or timetable events;
- assessments or grades; or
- learning analytics.

Those domains depend on the institution and academic-time identifiers established here.
