import type { BaselineRoleKey, MembershipStatus } from "@veza/contracts";
import { demoAccessDirectoryPage } from "./demo-direct-data";
import { demoModeEnabled } from "./demo-mode";
import { requestWorkspaceJson } from "./workspace-json-request";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBytes = 512 * 1024;
const membershipStatuses = new Set<MembershipStatus>(["invited", "active", "suspended", "expired", "revoked"]);
const invitationStatuses = new Set(["pending-delivery", "sent", "accepted", "expired", "revoked"] as const);
const roleKeys = new Set<BaselineRoleKey>([
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
  "auditor",
  "support-agent",
]);

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

export class AccessDirectoryApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function role(value: unknown): AccessRoleRecord {
  if (!isRecord(value)
    || typeof value.id !== "string" || !uuid.test(value.id)
    || !roleKeys.has(value.roleKey as BaselineRoleKey)
    || !["tenant", "institution"].includes(String(value.scopeType))
    || typeof value.scopeId !== "string" || !uuid.test(value.scopeId)
    || !optionalString(value.scopeLabel)
    || !isDate(value.validFrom)
    || !(value.validUntil === null || isDate(value.validUntil))) {
    throw new AccessDirectoryApiError(502, "Access role did not match the API contract");
  }
  return {
    id: value.id,
    roleKey: value.roleKey as BaselineRoleKey,
    scopeType: value.scopeType as "tenant" | "institution",
    scopeId: value.scopeId,
    ...(value.scopeLabel ? { scopeLabel: value.scopeLabel } : {}),
    validFrom: value.validFrom,
    validUntil: value.validUntil as string | null,
  };
}

function membership(value: unknown): AccessMembershipRecord {
  if (!isRecord(value)
    || typeof value.id !== "string" || !uuid.test(value.id)
    || typeof value.userId !== "string" || !uuid.test(value.userId)
    || !isRecord(value.identity)
    || !optionalString(value.identity.displayName)
    || !optionalString(value.identity.email)
    || !membershipStatuses.has(value.status as MembershipStatus)
    || typeof value.locale !== "string" || value.locale.length < 2
    || typeof value.timezone !== "string" || value.timezone.length < 3
    || !isDate(value.createdAt)
    || !Array.isArray(value.roles)) {
    throw new AccessDirectoryApiError(502, "Access membership did not match the API contract");
  }
  return {
    id: value.id,
    userId: value.userId,
    identity: {
      ...(value.identity.displayName ? { displayName: value.identity.displayName } : {}),
      ...(value.identity.email ? { email: value.identity.email } : {}),
    },
    status: value.status as MembershipStatus,
    locale: value.locale,
    timezone: value.timezone,
    createdAt: value.createdAt,
    roles: value.roles.map(role),
  };
}

function invitation(value: unknown): AccessInvitationRecord {
  if (!isRecord(value)
    || typeof value.id !== "string" || !uuid.test(value.id)
    || typeof value.email !== "string" || !value.email.includes("@")
    || !roleKeys.has(value.roleKey as BaselineRoleKey)
    || !["tenant", "institution"].includes(String(value.scopeType))
    || typeof value.scopeId !== "string" || !uuid.test(value.scopeId)
    || !optionalString(value.scopeLabel)
    || !invitationStatuses.has(value.status as AccessInvitationRecord["status"])
    || !isDate(value.expiresAt)
    || !isDate(value.createdAt)) {
    throw new AccessDirectoryApiError(502, "Access invitation did not match the API contract");
  }
  return {
    id: value.id,
    email: value.email,
    roleKey: value.roleKey as BaselineRoleKey,
    scopeType: value.scopeType as "tenant" | "institution",
    scopeId: value.scopeId,
    ...(value.scopeLabel ? { scopeLabel: value.scopeLabel } : {}),
    status: value.status as AccessInvitationRecord["status"],
    expiresAt: value.expiresAt,
    createdAt: value.createdAt,
  };
}

function directory(value: unknown): AccessDirectoryPage {
  if (!isRecord(value)
    || !Array.isArray(value.memberships)
    || !Array.isArray(value.invitations)
    || !isRecord(value.page)
    || !Number.isInteger(value.page.limit)
    || Number(value.page.limit) < 1
    || Number(value.page.limit) > 100
    || !optionalString(value.page.nextCursor)) {
    throw new AccessDirectoryApiError(502, "Access directory did not match the API contract");
  }
  return {
    memberships: value.memberships.map(membership),
    invitations: value.invitations.map(invitation),
    page: {
      limit: Number(value.page.limit),
      ...(value.page.nextCursor ? { nextCursor: value.page.nextCursor } : {}),
    },
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Access service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  });
}

export async function loadAccessDirectory(input: {
  readonly query?: string;
  readonly status?: string;
  readonly roleKey?: string;
  readonly institutionId?: string;
  readonly cursor?: string;
} = {}): Promise<AccessDirectoryPage> {
  if (demoModeEnabled()) {
    return demoAccessDirectoryPage(input) as unknown as AccessDirectoryPage;
  }
  const query = new URLSearchParams({ limit: "40" });
  if (input.query) query.set("query", input.query);
  if (input.status) query.set("status", input.status);
  if (input.roleKey) query.set("roleKey", input.roleKey);
  if (input.institutionId) query.set("institutionId", input.institutionId);
  if (input.cursor) query.set("cursor", input.cursor);
  return directory(await request(`/v1/access-directory?${query}`));
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
  if (!target) throw new AccessDirectoryApiError(400, "Access operation is not allowed");
  if (demoModeEnabled()) {
    return Promise.resolve({ ok: true, demo: true, persisted: false, operation });
  }
  const { membershipId: _membershipId, assignmentId: _assignmentId, invitationId: _invitationId, ...payload } = input;
  return request(target.path(input), { method: "POST", body: JSON.stringify(payload) });
}
