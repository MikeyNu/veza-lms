const maximumResponseBytes = 384 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PlatformAuditFilters {
  readonly eventType?: string;
  readonly actorId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface PlatformAuditEvent {
  readonly id: string;
  readonly eventType: string;
  readonly actor: { readonly id: string; readonly displayName?: string; readonly email?: string };
  readonly resource: { readonly type: string; readonly id: string };
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface PlatformAuditPage {
  readonly items: readonly PlatformAuditEvent[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value); }

function event(value: unknown): PlatformAuditEvent {
  if (!isRecord(value) || !uuidPattern.test(String(value.id)) || !string(value.eventType) || !isRecord(value.actor) || !isRecord(value.resource)) throw new Error("Platform audit event did not match the API contract");
  if (!uuidPattern.test(String(value.actor.id)) || !string(value.resource.type) || !string(value.resource.id) || !string(value.correlationId)) throw new Error("Platform audit actor or resource did not match the API contract");
  if (!isRecord(value.metadata) || !string(value.occurredAt) || !Number.isFinite(Date.parse(value.occurredAt))) throw new Error("Platform audit metadata did not match the API contract");
  if (value.actor.displayName !== undefined && typeof value.actor.displayName !== "string") throw new Error("Platform audit actor name did not match the API contract");
  if (value.actor.email !== undefined && typeof value.actor.email !== "string") throw new Error("Platform audit actor email did not match the API contract");
  return {
    id: String(value.id),
    eventType: value.eventType,
    actor: {
      id: String(value.actor.id),
      ...(value.actor.displayName ? { displayName: value.actor.displayName } : {}),
      ...(value.actor.email ? { email: value.actor.email } : {}),
    },
    resource: { type: value.resource.type, id: value.resource.id },
    correlationId: value.correlationId,
    metadata: value.metadata,
    occurredAt: value.occurredAt,
  };
}

function dateBoundary(value: string, exclusiveEnd: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }
  if (!Number.isFinite(Date.parse(value))) throw new Error("Platform audit date is invalid");
  return new Date(value).toISOString();
}

export async function loadPlatformAudit(accessToken: string, filters: PlatformAuditFilters): Promise<PlatformAuditPage> {
  const query = new URLSearchParams();
  if (filters.eventType) query.set("eventType", filters.eventType);
  if (filters.actorId) query.set("actorId", filters.actorId);
  if (filters.resourceType) query.set("resourceType", filters.resourceType);
  if (filters.resourceId) query.set("resourceId", filters.resourceId);
  if (filters.from) query.set("from", dateBoundary(filters.from, false));
  if (filters.to) query.set("to", dateBoundary(filters.to, true));
  if (filters.cursor) query.set("cursor", filters.cursor);
  query.set("limit", String(filters.limit ?? 50));
  const response = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/audit-events?${query.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Platform audit response is unexpectedly large");
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; } catch { throw new Error("Platform audit returned invalid JSON"); }
  if (!response.ok) throw new Error(`Platform audit API failed with status ${response.status}`);
  if (!isRecord(payload) || !Array.isArray(payload.items) || !isRecord(payload.page) || !integer(payload.page.limit) || payload.page.limit < 1 || payload.page.limit > 100) throw new Error("Platform audit page did not match the API contract");
  if (payload.page.nextCursor !== undefined && !string(payload.page.nextCursor)) throw new Error("Platform audit cursor did not match the API contract");
  return {
    items: payload.items.map(event),
    page: { limit: payload.page.limit, ...(payload.page.nextCursor ? { nextCursor: payload.page.nextCursor } : {}) },
  };
}
