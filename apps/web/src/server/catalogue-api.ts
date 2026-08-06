import type {
  CatalogueReferences,
  CatalogueWorkspace,
  CurriculumAnalysis,
  CurriculumHistory,
} from "@veza/contracts";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 2 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWorkspaceJson(path, {
    service: "Catalogue service",
    maximumBytes,
    timeoutMs: 15_000,
    ...(init ? { init } : {}),
  })) as T;
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
  return request(`${institutionPath(institutionId)}/runs/${courseRunId}/lifecycle`, {
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
  return request(`${institutionPath(institutionId)}/enrolments/${enrolmentId}/status`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function linkProgrammeCourse(
  institutionId: string,
  programmeVersionId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(programmeVersionId)) {
    throw new Error("Programme version identifier is invalid");
  }
  return request(
    `${institutionPath(institutionId)}/programmes/versions/${programmeVersionId}/courses`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function addCourseRequisite(
  institutionId: string,
  blueprintVersionId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(blueprintVersionId)) {
    throw new Error("Blueprint version identifier is invalid");
  }
  return request(
    `${institutionPath(institutionId)}/blueprints/versions/${blueprintVersionId}/requisites`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function allocateClassStaff(
  institutionId: string,
  classSectionId: string,
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(classSectionId)) throw new Error("Class section identifier is invalid");
  return request(`${institutionPath(institutionId)}/classes/${classSectionId}/staff`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
