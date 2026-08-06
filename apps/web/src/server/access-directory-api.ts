import { cookies } from "next/headers";
import type { BaselineRoleKey, MembershipStatus } from "@veza/contracts";
import { membershipCookieName } from "./auth-config";
import { getWebOidcSession } from "./web-session";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBytes = 512 * 1024;

export interface AccessRoleRecord {
  readonly id: string;
  readonly roleKey: BaselineRoleKey;
  readonly scopeType: "tenant" | "institution";
  readonly scopeId: string;
  readonly scopeLabel?: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

export interface AccessMembershipRecord {
  readonly id: string;
  readonly userId: string;
  readonly identity: { readonly displayName?: string; readonly email?: string };
  readonly status: MembershipStatus;
  readonly locale: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly roles: readonly AccessRoleRecord[];
}

export interface AccessInvitationRecord {
  readonly id: string;
  readonly email: string;
  readonly roleKey: BaselineRoleKey;
  readonly scopeType: "tenant" | "institution";
  readonly scopeId: string;
  readonly scopeLabel?: string;
  readonly status: "pending-delivery" | "sent" | "accepted" | "expired" | "revoked";
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface AccessDirectoryPage {
  readonly memberships: readonly AccessMembershipRecord[];
  readonly invitations: readonly AccessInvitationRecord[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

async function credentials() {
  const [session, store] = await Promise.all([getWebOidcSession(), cookies()]);
  const membershipId = store.get(membershipCookieName)?.value;
  if (!session || !membershipId || !uuid.test(membershipId)) throw new Error("An active workspace session is required");
  return { accessToken: session.accessToken, membershipId };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await credentials();
  const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "x-veza-membership-id": auth.membershipId,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("Access service returned an oversized response");
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error("Access service returned invalid JSON"); }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body
      ? String((body as { message?: unknown }).message ?? "Access operation failed")
      : "Access operation failed";
    throw new Error(message.slice(0, 300));
  }
  return body as T;
}

export function loadAccessDirectory(input: {
  readonly query?: string;
  readonly status?: string;
  readonly roleKey?: string;
  readonly institutionId?: string;
  readonly cursor?: string;
} = {}): Promise<AccessDirectoryPage> {
  const query = new URLSearchParams({ limit: "40" });
  if (input.query) query.set("query", input.query);
  if (input.status) query.set("status", input.status);
  if (input.roleKey) query.set("roleKey", input.roleKey);
  if (input.institutionId) query.set("institutionId", input.institutionId);
  if (input.cursor) query.set("cursor", input.cursor);
  return request(`/v1/access-directory?${query}`);
}

export function mutateAccessDirectory(operation: string, input: Readonly<Record<string, unknown>>) {
  const map: Readonly<Record<string, { readonly path: (body: Readonly<Record<string, unknown>>) => string }>> = {
    invite: { path: () => "/v1/access-directory/invitations" },
    "membership-status": { path: (body) => `/v1/access-directory/memberships/${String(body.membershipId)}/status` },
    "role-assign": { path: (body) => `/v1/access-directory/memberships/${String(body.membershipId)}/role-assignments` },
    "role-end": { path: (body) => `/v1/access-directory/role-assignments/${String(body.assignmentId)}/end` },
    "invitation-revoke": { path: (body) => `/v1/access-directory/invitations/${String(body.invitationId)}/revoke` },
    "invitation-resend": { path: (body) => `/v1/access-directory/invitations/${String(body.invitationId)}/resend` },
    "invitations-bulk-revoke": { path: () => "/v1/access-directory/invitations/bulk-revoke" },
  };
  const target = map[operation];
  if (!target) throw new Error("Access operation is not allowed");
  const { membershipId: _membershipId, assignmentId: _assignmentId, invitationId: _invitationId, ...payload } = input;
  return request(target.path(input), { method: "POST", body: JSON.stringify(payload) });
}
