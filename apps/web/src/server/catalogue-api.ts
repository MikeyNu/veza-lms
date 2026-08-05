import type {
  CatalogueReferences,
  CatalogueWorkspace,
  CurriculumAnalysis,
  CurriculumHistory,
} from "@veza/contracts";
import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("Catalogue service returned an oversized response");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error("Catalogue service returned an oversized response");
  }
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Catalogue service returned invalid JSON");
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Catalogue operation failed";
    throw new Error(message.slice(0, 300));
  }
  return body as T;
}

function institutionPath(institutionId: string): string {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return `/v1/institutions/${institutionId}/catalogue`;
}

function requireVersionId(versionId: string): void {
  if (!uuid.test(versionId)) throw new Error("Curriculum version identifier is invalid");
}

export function loadCatalogue(institutionId: string): Promise<CatalogueWorkspace> {
  return request<CatalogueWorkspace>(institutionPath(institutionId));
}

export function loadCatalogueReferences(
  institutionId: string,
): Promise<CatalogueReferences> {
  return request<CatalogueReferences>(`${institutionPath(institutionId)}/references`);
}

export function mutateCatalogue(
  institutionId: string,
  operation: string,
  input: unknown,
): Promise<unknown> {
  const allowlist = new Set([
    "outcomes",
    "programmes",
    "blueprints",
    "runs",
    "cohorts",
    "classes",
    "enrolments",
  ]);
  if (!allowlist.has(operation)) throw new Error("Catalogue operation is not allowed");
  return request(`${institutionPath(institutionId)}/${operation}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function approveCurriculum(
  institutionId: string,
  kind: "programmes" | "blueprints",
  versionId: string,
  input: unknown,
): Promise<unknown> {
  requireVersionId(versionId);
  return request(`${institutionPath(institutionId)}/${kind}/versions/${versionId}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function analyseCurriculum(
  institutionId: string,
  kind: "programmes" | "blueprints",
  versionId: string,
): Promise<CurriculumAnalysis> {
  requireVersionId(versionId);
  return request<CurriculumAnalysis>(
    `${institutionPath(institutionId)}/${kind}/versions/${versionId}/analysis`,
    { method: "POST", body: "{}" },
  );
}

export function submitCurriculum(
  institutionId: string,
  kind: "programmes" | "blueprints",
  versionId: string,
  expectedVersion: number,
): Promise<{
  id: string;
  lifecycle: "in_review";
  reviewId: string;
  version: number;
  validation: CurriculumAnalysis["validation"];
}> {
  requireVersionId(versionId);
  return request(
    `${institutionPath(institutionId)}/${kind}/versions/${versionId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    },
  );
}

export function loadCurriculumHistory(
  institutionId: string,
  kind: "programmes" | "blueprints",
  versionId: string,
): Promise<CurriculumHistory> {
  requireVersionId(versionId);
  return request<CurriculumHistory>(
    `${institutionPath(institutionId)}/${kind}/versions/${versionId}/history`,
  );
}

export function addProgrammeOutcomeRequirement(
  institutionId: string,
  versionId: string,
  input: unknown,
): Promise<unknown> {
  requireVersionId(versionId);
  return request(
    `${institutionPath(institutionId)}/programmes/versions/${versionId}/outcome-requirements`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createCurriculumValidationPolicy(
  institutionId: string,
  input: unknown,
): Promise<unknown> {
  return request(`${institutionPath(institutionId)}/validation-policies`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function approveCurriculumValidationPolicy(
  institutionId: string,
  policyId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(policyId)) throw new Error("Validation policy identifier is invalid");
  return request(
    `${institutionPath(institutionId)}/validation-policies/${policyId}/approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function transferEnrolment(
  institutionId: string,
  enrolmentId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(enrolmentId)) throw new Error("Enrolment identifier is invalid");
  return request(`${institutionPath(institutionId)}/enrolments/${enrolmentId}/transfer`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transitionCourseRun(
  institutionId: string,
  courseRunId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(courseRunId)) throw new Error("Course run identifier is invalid");
  return request(`${institutionPath(institutionId)}/runs/${courseRunId}/transition`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transitionEnrolment(
  institutionId: string,
  enrolmentId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(enrolmentId)) throw new Error("Enrolment identifier is invalid");
  return request(`${institutionPath(institutionId)}/enrolments/${enrolmentId}/transition`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function linkProgrammeCourse(
  institutionId: string,
  programmeVersionId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(programmeVersionId)) throw new Error("Programme version identifier is invalid");
  return request(
    `${institutionPath(institutionId)}/programmes/${programmeVersionId}/courses`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function addCourseRequisite(
  institutionId: string,
  blueprintVersionId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(blueprintVersionId)) throw new Error("Blueprint version identifier is invalid");
  return request(
    `${institutionPath(institutionId)}/blueprints/${blueprintVersionId}/requisites`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function allocateClassStaff(
  institutionId: string,
  classSectionId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(classSectionId)) throw new Error("Class section identifier is invalid");
  return request(
    `${institutionPath(institutionId)}/classes/${classSectionId}/staff-allocations`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
