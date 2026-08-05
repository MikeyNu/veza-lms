import type { PersonDirectoryPage, PersonDetail, PeopleImportDryRun } from "@veza/contracts";
import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;

export interface PeopleFilters { readonly search?: string; readonly status?: string; readonly learnersOnly?: boolean; readonly staffOnly?: boolean; readonly cursor?: string; readonly limit?: number; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumBytes) throw new Error("People service returned an oversized response");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("People service returned an oversized response");
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error("People service returned invalid JSON"); }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string" ? body.message : "People operation failed";
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

export function loadPerson(personId: string): Promise<PersonDetail> { return request<PersonDetail>(`/v1/people/${personId}`); }
export function createPerson(input: unknown): Promise<PersonDetail> { return request<PersonDetail>("/v1/people", { method: "POST", body: JSON.stringify(input) }); }
export function dryRunPeopleImport(input: unknown): Promise<PeopleImportDryRun> { return request<PeopleImportDryRun>("/v1/people/imports/dry-run", { method: "POST", body: JSON.stringify(input) }); }
export function commitPeopleImport(importId: string, reason: string): Promise<{ importId: string; state: string; committed: number }> { return request(`/v1/people/imports/${importId}/commit`, { method: "POST", body: JSON.stringify({ reason }) }); }
