import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";
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
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error("Catalogue service returned an oversized response");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("Catalogue service returned an oversized response");
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error("Catalogue service returned invalid JSON"); }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
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

export function loadCatalogue(institutionId: string): Promise<CatalogueWorkspace> {
  return request<CatalogueWorkspace>(institutionPath(institutionId));
}

export function loadCatalogueReferences(institutionId: string): Promise<CatalogueReferences> {
  return request<CatalogueReferences>(`${institutionPath(institutionId)}/references`);
}

export function mutateCatalogue(institutionId: string, operation: string, input: unknown): Promise<unknown> {
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
  if (!uuid.test(versionId)) throw new Error("Curriculum version identifier is invalid");
  return request(`${institutionPath(institutionId)}/${kind}/versions/${versionId}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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
