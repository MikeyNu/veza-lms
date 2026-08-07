import "server-only";

import type { BaselineRoleKey } from "@veza/contracts";
import {
  demoInstitutionId,
  demoLearnerPersonId,
  demoNow,
  demoTenantId,
} from "./demo-mode";

const demoMemberships: readonly Readonly<Record<string, unknown>>[] = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    userId: "00000000-0000-4000-8000-000000008001",
    identity: { displayName: "Naledi Mokoena", email: "naledi.mokoena@demo.veza.local" },
    status: "active",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    createdAt: "2026-01-15T08:00:00.000Z",
    roles: [
      {
        id: "00000000-0000-4000-8000-000000008101",
        roleKey: "learner",
        scopeType: "institution",
        scopeId: demoInstitutionId,
        scopeLabel: "Akha Academy",
        validFrom: "2026-01-15T08:00:00.000Z",
        validUntil: null,
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000302",
    userId: "00000000-0000-4000-8000-000000008002",
    identity: { displayName: "Lerato Khumalo", email: "lerato.khumalo@demo.veza.local" },
    status: "active",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    createdAt: "2025-01-15T08:00:00.000Z",
    roles: [
      {
        id: "00000000-0000-4000-8000-000000008102",
        roleKey: "instructor",
        scopeType: "institution",
        scopeId: demoInstitutionId,
        scopeLabel: "Akha Academy",
        validFrom: "2025-01-15T08:00:00.000Z",
        validUntil: null,
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000303",
    userId: "00000000-0000-4000-8000-000000008003",
    identity: { displayName: "Mpho Nkosi", email: "mpho.nkosi@demo.veza.local" },
    status: "active",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    createdAt: "2024-08-12T08:00:00.000Z",
    roles: [
      {
        id: "00000000-0000-4000-8000-000000008103",
        roleKey: "institution-admin",
        scopeType: "institution",
        scopeId: demoInstitutionId,
        scopeLabel: "Akha Academy",
        validFrom: "2024-08-12T08:00:00.000Z",
        validUntil: null,
      },
    ],
  },
] as const;

export function demoAccessDirectoryPage(input: {
  readonly query?: string;
  readonly status?: string;
  readonly roleKey?: string;
} = {}) {
  const query = input.query?.trim().toLowerCase();
  const memberships = demoMemberships.filter((item) => {
    const identity = item.identity as { displayName?: string; email?: string };
    const roles = item.roles as readonly { roleKey: BaselineRoleKey }[];
    if (input.status && item.status !== input.status) return false;
    if (input.roleKey && !roles.some((role) => role.roleKey === input.roleKey)) return false;
    if (query && !`${identity.displayName ?? ""} ${identity.email ?? ""}`.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  return {
    memberships,
    invitations: [
      {
        id: "00000000-0000-4000-8000-000000008201",
        email: "new.facilitator@demo.veza.local",
        roleKey: "instructor",
        scopeType: "institution",
        scopeId: demoInstitutionId,
        scopeLabel: "Akha Academy",
        status: "sent",
        expiresAt: "2026-08-14T09:00:00.000Z",
        createdAt: "2026-08-07T09:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000008202",
        email: "audit.partner@demo.veza.local",
        roleKey: "auditor",
        scopeType: "tenant",
        scopeId: demoTenantId,
        scopeLabel: "Akha Academy tenant",
        status: "pending-delivery",
        expiresAt: "2026-08-13T13:00:00.000Z",
        createdAt: "2026-08-07T08:40:00.000Z",
      },
    ],
    page: { limit: 40 },
  };
}

const institutionDetail = {
  institution: {
    id: demoInstitutionId,
    code: "AKHA",
    displayName: "Akha Academy",
    legalName: "Akha Academy (Pty) Ltd",
    institutionType: "training-provider",
    status: "active",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    contactEmail: "academy@demo.veza.local",
  },
  campuses: [
    {
      id: "00000000-0000-4000-8000-000000004101",
      code: "JHB",
      displayName: "Johannesburg Campus",
      deliveryMode: "hybrid",
      status: "active",
      isPrimary: true,
      timezone: "Africa/Johannesburg",
    },
    {
      id: "00000000-0000-4000-8000-000000004102",
      code: "ONLINE",
      displayName: "Online Campus",
      deliveryMode: "virtual",
      status: "active",
      isPrimary: false,
      timezone: "Africa/Johannesburg",
    },
  ],
  organisationalUnits: [
    {
      id: "00000000-0000-4000-8000-000000004301",
      code: "DIGITAL",
      displayName: "School of Digital Learning",
      unitType: "school",
      status: "active",
    },
    {
      id: "00000000-0000-4000-8000-000000004302",
      code: "STUDENT",
      displayName: "Student Success",
      unitType: "centre",
      status: "active",
    },
  ],
  academicPeriods: [
    {
      id: "00000000-0000-4000-8000-000000004201",
      code: "2026-S2",
      displayName: "Semester 2 2026",
      periodType: "semester",
      status: "published",
      startsOn: "2026-07-13",
      endsOn: "2026-11-20",
      timezone: "Africa/Johannesburg",
    },
  ],
  policies: [
    {
      id: "00000000-0000-4000-8000-000000004401",
      policyKey: "privacy",
      version: 2,
      status: "approved",
      title: "Privacy and data handling",
      effectiveFrom: "2026-01-01",
    },
    {
      id: "00000000-0000-4000-8000-000000004402",
      policyKey: "academic-integrity",
      version: 3,
      status: "approved",
      title: "Academic integrity",
      effectiveFrom: "2026-01-01",
    },
    {
      id: "00000000-0000-4000-8000-000000004403",
      policyKey: "assessment",
      version: 1,
      status: "approved",
      title: "Assessment governance",
      effectiveFrom: "2026-01-01",
    },
  ],
} as const;

export function demoInstitutionSetupBundle(selectedInstitutionId?: string) {
  const selected = !selectedInstitutionId || selectedInstitutionId === demoInstitutionId;
  return {
    profile: {
      identityMode: "hybrid",
      supportEmail: "support@demo.veza.local",
      privacyContactEmail: "privacy@demo.veza.local",
      dataRetentionDays: 2555,
      learnerSupportSlaHours: 24,
    },
    institutions: [
      {
        id: demoInstitutionId,
        code: "AKHA",
        displayName: "Akha Academy",
        institutionType: "training-provider",
        status: "active",
        activeCampuses: 2,
        activeUnits: 2,
        publishedPeriods: 1,
        approvedPolicies: ["privacy", "academic-integrity", "assessment"],
      },
    ],
    selectedInstitution: selected ? institutionDetail : null,
    readiness: {
      tenantId: demoTenantId,
      tenantStatus: "active",
      ready: true,
      evaluatedAt: demoNow,
      checks: [
        {
          key: "institution",
          label: "Institution structure",
          passed: true,
          blocking: true,
          detail: "At least one active institution, campus and organisational unit are configured.",
          institutionId: demoInstitutionId,
        },
        {
          key: "academic-period",
          label: "Academic period",
          passed: true,
          blocking: true,
          detail: "A published academic period is available for delivery.",
          institutionId: demoInstitutionId,
        },
        {
          key: "policies",
          label: "Required policies",
          passed: true,
          blocking: true,
          detail: "Privacy, academic integrity and assessment policies are approved.",
          institutionId: demoInstitutionId,
        },
      ],
    },
  };
}

export function demoScopedInstitutionBundle() {
  return {
    profile: null,
    institutions: [],
    selectedInstitution: institutionDetail,
    readiness: null,
  };
}

export function demoAuditEvents(limit = 30) {
  return {
    items: [
      {
        id: "00000000-0000-4000-8000-000000008301",
        tenantId: demoTenantId,
        plane: "application",
        eventType: "assessment.result.published",
        actorId: "00000000-0000-4000-8000-000000008003",
        membershipId: "00000000-0000-4000-8000-000000000303",
        resource: { type: "course-run", id: "00000000-0000-4000-8000-000000001201" },
        purpose: "Academic result release",
        correlationId: "demo-correlation-result-001",
        changes: {
          before: { state: "draft" },
          after: { state: "published", resultCount: 34 },
        },
        metadata: { institutionId: demoInstitutionId },
        occurredAt: "2026-08-07T09:35:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000008302",
        tenantId: demoTenantId,
        plane: "application",
        eventType: "people.relationship.verified",
        actorId: "00000000-0000-4000-8000-000000008003",
        membershipId: "00000000-0000-4000-8000-000000000303",
        resource: { type: "person", id: demoLearnerPersonId },
        purpose: "Guardian relationship verification",
        correlationId: "demo-correlation-relationship-001",
        changes: { after: { relationshipType: "guardian", state: "active" } },
        metadata: { institutionId: demoInstitutionId },
        occurredAt: "2026-08-06T14:20:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000008303",
        tenantId: demoTenantId,
        plane: "application",
        eventType: "studio.publication.created",
        actorId: "00000000-0000-4000-8000-000000008002",
        membershipId: "00000000-0000-4000-8000-000000000302",
        resource: { type: "course-space", id: "00000000-0000-4000-8000-000000006001" },
        purpose: "Course publication",
        correlationId: "demo-correlation-publication-001",
        changes: { after: { publicationNumber: 4, status: "current" } },
        metadata: { institutionId: demoInstitutionId },
        occurredAt: "2026-08-04T11:30:00.000Z",
      },
    ],
    page: { limit },
  };
}

export function demoPeopleBulkReceipt(input: {
  readonly records: readonly unknown[];
  readonly status: "active" | "inactive";
}) {
  return {
    operationId: "00000000-0000-4000-8000-000000008401",
    requestedCount: input.records.length,
    changedCount: input.records.length,
    unchangedCount: 0,
    status: input.status,
  };
}
