import type {
  ResolvedInstitutionTerminology,
  TerminologyVersion,
} from "@veza/contracts";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWorkspaceJson(path, {
    service: "Terminology service",
    maximumBytes,
    timeoutMs: 15_000,
    ...(init ? { init } : {}),
  })) as T;
}

function root(institutionId: string): string {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return `/v1/institutions/${institutionId}/terminology`;
}

export function loadTerminologyVersions(
  institutionId: string,
): Promise<readonly TerminologyVersion[]> {
  return request(root(institutionId));
}

export function loadResolvedTerminology(
  institutionId: string,
  locale: string,
): Promise<ResolvedInstitutionTerminology> {
  const query = new URLSearchParams({ locale });
  return request(`${root(institutionId)}/resolved?${query}`);
}

export function createTerminologyVersion(institutionId: string, input: unknown) {
  return request(root(institutionId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transitionTerminologyVersion(
  institutionId: string,
  versionId: string,
  action: "submit" | "approve",
  input: unknown,
) {
  if (!uuid.test(versionId)) throw new Error("Terminology version identifier is invalid");
  return request(`${root(institutionId)}/${versionId}/${action}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
