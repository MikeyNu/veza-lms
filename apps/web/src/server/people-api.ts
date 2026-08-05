import type {
  DuplicateCandidatePage,
  PersonDirectoryPage,
  PersonDetail,
  PeopleImportDryRun,
} from "@veza/contracts";
import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;
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
    throw new Error(message.slice(0, 240));
  }
  return body as T;
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
  const raw = await request<any>(`/v1/people/${personId}`);
  const givenName = raw.legal_given_names ?? raw.givenName;
  const familyName = raw.legal_family_name ?? raw.familyName;
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
      (contact: any) =>
        (contact.kind ?? contact.type) === "email" &&
        (contact.is_primary ?? contact.isPrimary),
    )?.value,
    learnerStatus: raw.learner?.status,
    staffStatus: raw.staff?.status,
    institutionalIdentifiers: raw.identifiers ?? [],
    updatedAt: raw.updated_at ?? raw.updatedAt,
    contacts: (raw.contacts ?? []).map((contact: any) => ({
      id: contact.id,
      type:
        contact.kind === "mobile" || contact.kind === "telephone"
          ? "phone"
          : (contact.kind ?? contact.type),
      value: contact.value,
      label: contact.label ?? undefined,
      isPrimary: contact.is_primary ?? contact.isPrimary,
      verifiedAt: contact.verification_recorded_at ?? contact.verifiedAt ?? undefined,
    })),
    learner: raw.learner
      ? {
          id: raw.learner.person_id ?? raw.learner.id,
          status: raw.learner.status === "prospective" ? "applicant" : raw.learner.status,
          admissionDate: raw.learner.admission_date ?? undefined,
          completionDate: raw.learner.exit_date ?? undefined,
        }
      : undefined,
    staff: raw.staff
      ? {
          id: raw.staff.person_id ?? raw.staff.id,
          status: raw.staff.status === "on_leave" ? "leave" : raw.staff.status,
          employeeNumber: raw.staff.employee_number ?? undefined,
          engagementType: raw.staff.engagement_type ?? undefined,
        }
      : undefined,
    relationships: (raw.relationships ?? []).map((relationship: any) => ({
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
