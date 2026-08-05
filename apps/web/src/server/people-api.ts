import type {
  DuplicateCandidatePage,
  PersonDirectoryPage,
  PersonDetail,
  PeopleImportDryRun,
  PeopleImportRowRecord,
} from "@veza/contracts";
import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PeopleFilters {
  readonly search?: string;
  readonly status?: string;
  readonly learnersOnly?: boolean;
  readonly staffOnly?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumBytes) {
    throw new Error("People service returned an oversized response");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error("People service returned an oversized response");
  }
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("People service returned invalid JSON");
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "People operation failed";
    throw new Error(message.slice(0, 300));
  }
  return body as T;
}

function requireUuid(value: string, label: string): void {
  if (!uuid.test(value)) throw new Error(`${label} is invalid`);
}

export async function loadPeople(filters: PeopleFilters): Promise<PersonDirectoryPage> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  if (filters.learnersOnly) query.set("learnersOnly", "true");
  if (filters.staffOnly) query.set("staffOnly", "true");
  if (filters.cursor) query.set("cursor", filters.cursor);
  query.set("limit", String(filters.limit ?? 30));
  return request<PersonDirectoryPage>(`/v1/people?${query}`);
}

export function loadDuplicateCandidates(cursor?: string): Promise<DuplicateCandidatePage> {
  const query = new URLSearchParams({ status: "open", limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return request(`/v1/people/duplicates?${query}`);
}

export async function loadPerson(personId: string): Promise<PersonDetail> {
  requireUuid(personId, "Person identifier");
  const raw = await request<Record<string, any>>(`/v1/people/${personId}`);
  const givenName = raw.legal_given_names ?? raw.givenName;
  const familyName = raw.legal_family_name ?? raw.familyName;
  const identifierRows = raw.identifiers ?? [];
  return {
    id: raw.id,
    version: raw.version,
    displayName: raw.preferred_name ?? raw.preferredName ?? `${givenName} ${familyName}`,
    givenName,
    familyName,
    preferredName: raw.preferred_name ?? raw.preferredName ?? undefined,
    dateOfBirth: raw.date_of_birth ?? raw.dateOfBirth ?? undefined,
    locale: raw.locale,
    userId: raw.linked_user_id ?? raw.userId ?? undefined,
    status: raw.status,
    primaryEmail: raw.contacts?.find(
      (contact: Record<string, any>) =>
        (contact.kind ?? contact.type) === "email" &&
        (contact.is_primary ?? contact.isPrimary),
    )?.value,
    learnerStatus:
      raw.learner?.status === "prospective" ? "applicant" : raw.learner?.status,
    staffStatus: raw.staff?.status === "on_leave" ? "leave" : raw.staff?.status,
    institutionalIdentifiers: identifierRows.map(
      (identifier: Record<string, any> | string) =>
        typeof identifier === "string"
          ? identifier
          : String(identifier.identifier_value ?? identifier.identifierValue),
    ),
    updatedAt: raw.updated_at ?? raw.updatedAt,
    contacts: (raw.contacts ?? []).map((contact: Record<string, any>) => ({
      id: contact.id,
      version: contact.version ?? 1,
      kind: contact.kind,
      type: contact.kind === "email" ? "email" : "phone",
      value: contact.value,
      label: contact.label ?? undefined,
      isPrimary: Boolean(contact.is_primary ?? contact.isPrimary),
      isVerified: Boolean(contact.is_verified ?? contact.isVerified),
      verifiedAt: contact.verification_recorded_at ?? contact.verifiedAt ?? undefined,
      validFrom: contact.valid_from ?? contact.validFrom,
      validUntil: contact.valid_until ?? contact.validUntil ?? undefined,
    })),
    addresses: (raw.addresses ?? []).map((address: Record<string, any>) => ({
      id: address.id,
      version: address.version ?? 1,
      addressType: address.address_type ?? address.addressType,
      address: address.address ?? {},
      isPrimary: Boolean(address.is_primary ?? address.isPrimary),
      validFrom: address.valid_from ?? address.validFrom,
      validUntil: address.valid_until ?? address.validUntil ?? undefined,
    })),
    identifiers: identifierRows
      .filter((identifier: unknown) => typeof identifier === "object" && identifier !== null)
      .map((identifier: Record<string, any>) => ({
        id: identifier.id,
        version: identifier.version ?? 1,
        institutionId: identifier.institution_id ?? identifier.institutionId ?? undefined,
        identifierType: identifier.identifier_type ?? identifier.identifierType,
        identifierValue: identifier.identifier_value ?? identifier.identifierValue,
        issuingAuthority: identifier.issuing_authority ?? identifier.issuingAuthority ?? undefined,
        validFrom: identifier.valid_from ?? identifier.validFrom,
        validUntil: identifier.valid_until ?? identifier.validUntil ?? undefined,
      })),
    organisationalAssignments: (raw.organisational_assignments ?? []).map(
      (assignment: Record<string, any>) => ({
        id: assignment.id,
        version: assignment.version ?? 1,
        institutionId: assignment.institution_id,
        organisationalUnitId: assignment.organisational_unit_id,
        assignmentType: assignment.assignment_type,
        title: assignment.title ?? undefined,
        isPrimary: Boolean(assignment.is_primary),
        validFrom: assignment.valid_from,
        validUntil: assignment.valid_until ?? undefined,
      }),
    ),
    staffEngagements: (raw.staff_engagements ?? []).map(
      (engagement: Record<string, any>) => ({
        id: engagement.id,
        version: engagement.version,
        institutionId: engagement.institution_id,
        organisationalUnitId: engagement.organisational_unit_id ?? undefined,
        engagementType: engagement.engagement_type,
        employeeNumber: engagement.employee_number ?? undefined,
        title: engagement.title ?? undefined,
        status: engagement.status,
        startedOn: engagement.started_on,
        endedOn: engagement.ended_on ?? undefined,
      }),
    ),
    consents: (raw.consents ?? []).map((consent: Record<string, any>) => ({
      id: consent.id,
      version: consent.version,
      relationshipId: consent.relationship_id ?? undefined,
      purposeCode: consent.purpose_code,
      status: consent.status,
      evidence: consent.evidence ?? {},
      grantedAt: consent.granted_at ?? undefined,
      expiresAt: consent.expires_at ?? undefined,
      withdrawnAt: consent.withdrawn_at ?? undefined,
    })),
    disclosureRestrictions: (raw.disclosure_restrictions ?? []).map(
      (restriction: Record<string, any>) => ({
        id: restriction.id,
        version: restriction.version,
        restrictionCode: restriction.restriction_code,
        reason: restriction.reason,
        appliesToRelationshipTypes: restriction.applies_to_relationship_types ?? [],
        effectiveFrom: restriction.effective_from,
        effectiveUntil: restriction.effective_until ?? undefined,
        liftedAt: restriction.lifted_at ?? undefined,
      }),
    ),
    identityLinkRequests: (raw.identity_link_requests ?? []).map(
      (link: Record<string, any>) => ({
        id: link.id,
        personId,
        institutionId: link.institution_id,
        membershipInvitationId: link.membership_invitation_id ?? undefined,
        requestedEmail: link.requested_email ?? undefined,
        requestedRoleKey: link.requested_role_key ?? undefined,
        status: link.status,
        linkedUserId: link.linked_user_id ?? undefined,
        expiresAt: link.expires_at ?? undefined,
        completedAt: link.completed_at ?? undefined,
        version: link.version,
      }),
    ),
    dataSubjectRequests: (raw.data_subject_requests ?? []).map(
      (subjectRequest: Record<string, any>) => ({
        id: subjectRequest.id,
        personId: subjectRequest.person_id,
        requestType: subjectRequest.request_type,
        status: subjectRequest.status,
        reason: subjectRequest.reason,
        exportFormat: subjectRequest.export_format ?? undefined,
        exportChecksum: subjectRequest.export_checksum ?? undefined,
        requestedAt: subjectRequest.requested_at,
        readyAt: subjectRequest.ready_at ?? undefined,
        deliveredAt: subjectRequest.delivered_at ?? undefined,
        version: subjectRequest.version,
      }),
    ),
    learner: raw.learner
      ? {
          id: raw.learner.person_id ?? raw.learner.id,
          institutionId: raw.learner.institution_id,
          status: raw.learner.status === "prospective" ? "applicant" : raw.learner.status,
          admissionDate: raw.learner.admission_date ?? undefined,
          completionDate: raw.learner.exit_date ?? undefined,
        }
      : undefined,
    staff: raw.staff
      ? {
          id: raw.staff.person_id ?? raw.staff.id,
          institutionId: raw.staff.institution_id,
          status: raw.staff.status === "on_leave" ? "leave" : raw.staff.status,
          employeeNumber: raw.staff.employee_number ?? undefined,
          engagementType: raw.staff.engagement_type ?? undefined,
          startedOn: raw.staff.started_on ?? undefined,
          endedOn: raw.staff.ended_on ?? undefined,
        }
      : undefined,
    relationships: (raw.relationships ?? []).map((relationship: Record<string, any>) => ({
      id: relationship.id,
      version: relationship.version ?? 1,
      institutionId: relationship.institution_id ?? relationship.institutionId ?? undefined,
      relatedPersonId: relationship.related_person_id ?? relationship.relatedPersonId,
      type: String(relationship.relationship_type ?? relationship.type).replaceAll("_", "-"),
      status: relationship.revoked_at
        ? "revoked"
        : relationship.valid_until && Date.parse(relationship.valid_until) < Date.now()
          ? "expired"
          : relationship.verified_at
            ? "active"
            : "pending",
      canReceiveCommunications: Boolean(
        (relationship.authority ?? {}).canReceiveCommunications,
      ),
      canAccessRecords: Boolean((relationship.authority ?? {}).canAccessRecords),
      startsOn: relationship.valid_from ?? relationship.startsOn,
      endsOn: relationship.valid_until ?? undefined,
    })),
  } as PersonDetail;
}

export function createPerson(input: unknown): Promise<PersonDetail> {
  return request<PersonDetail>("/v1/people", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function dryRunPeopleImport(input: unknown): Promise<PeopleImportDryRun> {
  return request<PeopleImportDryRun>("/v1/people/imports/dry-run", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function commitPeopleImport(importId: string, reason: string) {
  requireUuid(importId, "Import identifier");
  return request<{ importId: string; state: string; committed: number }>(
    `/v1/people/imports/${importId}/commit`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function updateLearner(personId: string, institutionId: string, input: unknown) {
  return request(`/v1/people/${personId}/institutions/${institutionId}/learner-profile`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updateStaff(personId: string, institutionId: string, input: unknown) {
  return request(`/v1/people/${personId}/institutions/${institutionId}/staff-profile`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function createRelationship(
  personId: string,
  institutionId: string,
  input: unknown,
) {
  return request(`/v1/people/${personId}/institutions/${institutionId}/relationships`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transitionRelationship(
  relationshipId: string,
  institutionId: string,
  action: "verify" | "revoke",
  input: unknown,
) {
  return request(
    `/v1/people/institutions/${institutionId}/relationships/${relationshipId}/${action}`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createPersonOperation(
  institutionId: string,
  personId: string,
  operation: string,
  input: unknown,
) {
  const allowlist = new Set([
    "contacts",
    "addresses",
    "identifiers",
    "organisational-assignments",
    "staff-engagements",
    "consents",
    "disclosure-restrictions",
    "identity-invitations",
    "identity-links",
    "relationship-invitations",
    "data-subject-requests",
  ]);
  requireUuid(institutionId, "Institution identifier");
  requireUuid(personId, "Person identifier");
  if (!allowlist.has(operation)) throw new Error("People operation is not allowed");
  return request(`/v1/people/institutions/${institutionId}/persons/${personId}/${operation}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function endStaffEngagement(
  institutionId: string,
  engagementId: string,
  input: unknown,
) {
  requireUuid(institutionId, "Institution identifier");
  requireUuid(engagementId, "Staff engagement identifier");
  return request(
    `/v1/people/institutions/${institutionId}/staff-engagements/${engagementId}/end`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function loadPeopleImportRows(institutionId: string, importId: string) {
  requireUuid(institutionId, "Institution identifier");
  requireUuid(importId, "Import identifier");
  return request<{ importId: string; status: string; rows: readonly PeopleImportRowRecord[] }>(
    `/v1/people/institutions/${institutionId}/imports/${importId}/rows`,
  );
}

export function reconcilePeopleImportRow(
  institutionId: string,
  importId: string,
  rowId: string,
  input: unknown,
) {
  requireUuid(rowId, "Import row identifier");
  return request(
    `/v1/people/institutions/${institutionId}/imports/${importId}/rows/${rowId}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function resolvePeopleImportDuplicate(
  institutionId: string,
  importId: string,
  rowId: string,
  input: unknown,
) {
  requireUuid(rowId, "Import row identifier");
  return request(
    `/v1/people/institutions/${institutionId}/imports/${importId}/rows/${rowId}/duplicate-resolution`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function loadDataSubjectRequest(
  institutionId: string,
  personId: string,
  requestId: string,
) {
  requireUuid(requestId, "Data-subject request identifier");
  return request(
    `/v1/people/institutions/${institutionId}/persons/${personId}/data-subject-requests/${requestId}`,
  );
}

export function decideDuplicate(candidateId: string, input: unknown) {
  return request(`/v1/people/duplicates/${candidateId}/decision`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function mergePeople(input: unknown) {
  return request("/v1/people/merges", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
