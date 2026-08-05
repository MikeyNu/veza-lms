import { cookies } from "next/headers";
import { membershipCookieName } from "./auth-config";
import { getWebOidcSession } from "./web-session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumResponseBytes = 512 * 1024;

export interface AuditFilters {
  readonly eventType?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly actorId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AuditEventView {
  readonly id: string;
  readonly tenantId: string;
  readonly plane: "control" | "application";
  readonly eventType: string;
  readonly actorId: string;
  readonly membershipId?: string;
  readonly resource: { readonly type: string; readonly id: string };
  readonly purpose?: string;
  readonly correlationId: string;
  readonly changes: {
    readonly before?: Readonly<Record<string, unknown>>;
    readonly after?: Readonly<Record<string, unknown>>;
  };
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface AuditEventPage {
  readonly items: readonly AuditEventView[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

export class AuditApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function optionalUuid(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && uuidPattern.test(value));
}

function safeObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value === undefined ? undefined : isRecord(value) ? value : undefined;
}

function event(value: unknown): AuditEventView {
  if (!isRecord(value) || !uuidPattern.test(String(value.id)) || !uuidPattern.test(String(value.tenantId))) {
    throw new AuditApiError(502, "Audit event identifiers did not match the API contract");
  }
  if (!["control", "application"].includes(String(value.plane)) || !nonEmptyString(value.eventType)) {
    throw new AuditApiError(502, "Audit event type did not match the API contract");
  }
  if (!uuidPattern.test(String(value.actorId)) || !optionalUuid(value.membershipId) || !isRecord(value.resource)) {
    throw new AuditApiError(502, "Audit actor or resource did not match the API contract");
  }
  if (!nonEmptyString(value.resource.type) || !nonEmptyString(value.resource.id) || !nonEmptyString(value.correlationId)) {
    throw new AuditApiError(502, "Audit resource or correlation data did not match the API contract");
  }
  if (!isRecord(value.changes) || !isRecord(value.metadata) || !nonEmptyString(value.occurredAt) || !Number.isFinite(Date.parse(value.occurredAt))) {
    throw new AuditApiError(502, "Audit evidence payload did not match the API contract");
  }
  const before = safeObject(value.changes.before);
  const after = safeObject(value.changes.after);
  if ((value.changes.before !== undefined && !before) || (value.changes.after !== undefined && !after)) {
    throw new AuditApiError(502, "Audit change evidence did not match the API contract");
  }
  return {
    id: String(value.id),
    tenantId: String(value.tenantId),
    plane: value.plane as AuditEventView["plane"],
    eventType: String(value.eventType),
    actorId: String(value.actorId),
    ...(value.membershipId ? { membershipId: String(value.membershipId) } : {}),
    resource: { type: String(value.resource.type), id: String(value.resource.id) },
    ...(nonEmptyString(value.purpose) ? { purpose: value.purpose } : {}),
    correlationId: String(value.correlationId),
    changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
    metadata: value.metadata,
    occurredAt: String(value.occurredAt),
  };
}

function dateBoundary(value: string, exclusiveEnd: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }
  if (!Number.isFinite(Date.parse(value))) throw new AuditApiError(400, "Audit date filter is invalid");
  return new Date(value).toISOString();
}

function queryString(filters: AuditFilters): string {
  const query = new URLSearchParams();
  if (filters.eventType) query.set("eventType", filters.eventType);
  if (filters.resourceType) query.set("resourceType", filters.resourceType);
  if (filters.resourceId) query.set("resourceId", filters.resourceId);
  if (filters.actorId) query.set("actorId", filters.actorId);
  if (filters.from) query.set("from", dateBoundary(filters.from, false));
  if (filters.to) query.set("to", dateBoundary(filters.to, true));
  if (filters.cursor) query.set("cursor", filters.cursor);
  query.set("limit", String(filters.limit ?? 30));
  return query.toString();
}

export async function loadAuditEvents(filters: AuditFilters): Promise<AuditEventPage> {
  const [session, cookieStore] = await Promise.all([getWebOidcSession(), cookies()]);
  const membershipId = cookieStore.get(membershipCookieName)?.value;
  if (!session || !membershipId || !uuidPattern.test(membershipId)) {
    throw new AuditApiError(401, "An active workspace session is required");
  }

  const response = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/audit-events?${queryString(filters)}`, {
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "x-veza-membership-id": membershipId,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new AuditApiError(502, "Audit response is unexpectedly large");

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new AuditApiError(502, "Audit service returned invalid JSON");
  }
  if (!response.ok) throw new AuditApiError(response.status, "Audit evidence could not be loaded");
  if (!isRecord(payload) || !Array.isArray(payload.items) || !isRecord(payload.page)) {
    throw new AuditApiError(502, "Audit page did not match the API contract");
  }
  if (!integer(payload.page.limit) || payload.page.limit < 1 || payload.page.limit > 100) {
    throw new AuditApiError(502, "Audit page limit did not match the API contract");
  }
  if (payload.page.nextCursor !== undefined && !nonEmptyString(payload.page.nextCursor)) {
    throw new AuditApiError(502, "Audit cursor did not match the API contract");
  }
  return {
    items: payload.items.map(event),
    page: {
      limit: payload.page.limit,
      ...(payload.page.nextCursor ? { nextCursor: String(payload.page.nextCursor) } : {}),
    },
  };
}
