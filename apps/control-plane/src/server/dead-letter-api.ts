const maximumResponseBytes = 256 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DeadLetterEventView {
  readonly id: string;
  readonly tenantId: string;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly aggregate: { readonly type: string; readonly id: string; readonly version: number };
  readonly attempts: number;
  readonly failureCode: string;
  readonly occurredAt: string;
  readonly deadLetteredAt: string;
}

export interface DeadLetterFilters {
  readonly tenantId?: string;
  readonly eventName?: string;
  readonly aggregateType?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
}

export interface DeadLetterPage {
  readonly items: readonly DeadLetterEventView[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function timestamp(value: unknown): value is string { return string(value) && Number.isFinite(Date.parse(value)); }

function item(value: unknown): DeadLetterEventView {
  if (!isRecord(value) || !uuidPattern.test(String(value.id)) || !uuidPattern.test(String(value.tenantId)) || !string(value.eventName) || !integer(value.eventVersion) || !isRecord(value.aggregate) || !string(value.aggregate.type) || !string(value.aggregate.id) || !integer(value.aggregate.version) || !integer(value.attempts) || !string(value.failureCode) || !timestamp(value.occurredAt) || !timestamp(value.deadLetteredAt)) {
    throw new Error("Dead-letter event did not match the API contract");
  }
  return {
    id: String(value.id), tenantId: String(value.tenantId), eventName: value.eventName,
    eventVersion: value.eventVersion, aggregate: { type: value.aggregate.type, id: value.aggregate.id, version: value.aggregate.version },
    attempts: value.attempts, failureCode: value.failureCode, occurredAt: value.occurredAt, deadLetteredAt: value.deadLetteredAt,
  };
}

export async function loadDeadLetters(accessToken: string, filters: DeadLetterFilters): Promise<DeadLetterPage> {
  const query = new URLSearchParams({ limit: "40" });
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const response = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/outbox-dead-letters?${query}`, {
    headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Dead-letter response is unexpectedly large");
  let document: unknown;
  try { document = JSON.parse(text) as unknown; } catch { throw new Error("Dead-letter API returned invalid JSON"); }
  if (!response.ok) throw new Error(`Dead-letter API failed with status ${response.status}`);
  if (!isRecord(document) || !Array.isArray(document.items) || document.items.length > 41 || !isRecord(document.page) || !integer(document.page.limit) || (document.page.nextCursor !== undefined && !string(document.page.nextCursor))) {
    throw new Error("Dead-letter page did not match the API contract");
  }
  return { items: document.items.map(item), page: { limit: document.page.limit, ...(document.page.nextCursor ? { nextCursor: document.page.nextCursor } : {}) } };
}
