import type {
  ResolvedInstitutionTerminology,
  TerminologyVersion,
} from "@veza/contracts";
import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 1024 * 1024;
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
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error("Terminology response is too large");
  }
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Terminology service returned invalid JSON");
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : "Terminology operation failed";
    throw new Error(message.slice(0, 300));
  }
  return body as T;
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
