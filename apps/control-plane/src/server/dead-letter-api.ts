const maximumResponseBytes = 256 * 1024;
const maximumPageItems = 40;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventNamePattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i;
const aggregateTypePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const failureCodePattern = /^[A-Za-z0-9._-]{2,80}$/;

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

function nonEmptyString(value: unknown, maximum = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function timestamp(value: unknown): value is string {
  return nonEmptyString(value, 64) && Number.isFinite(Date.parse(value));
}

function parseEvent(value: unknown): DeadLetterEventView {
  if (!isRecord(value)
    || !uuidPattern.test(String(value.id))
    || !uuidPattern.test(String(value.tenantId))
    || !nonEmptyString(value.eventName, 160)
    || !eventNamePattern.test(value.eventName)
    || !nonNegativeInteger(value.eventVersion)
    || !isRecord(value.aggregate)
    || !nonEmptyString(value.aggregate.type, 120)
    || !aggregateTypePattern.test(value.aggregate.type)
    || !nonEmptyString(value.aggregate.id, 180)
    || !nonNegativeInteger(value.aggregate.version)
    || !nonNegativeInteger(value.attempts)
    || !nonEmptyString(value.failureCode, 80)
    || !failureCodePattern.test(value.failureCode)
    || !timestamp(value.occurredAt)
    || !timestamp(value.deadLetteredAt)) {
    throw new Error("Dead-letter event did not match the API contract");
  }

  return {
    id: String(value.id),
    tenantId: String(value.tenantId),
    eventName: value.eventName,
    eventVersion: value.eventVersion,
    aggregate: {
      type: value.aggregate.type,
      id: value.aggregate.id,
      version: value.aggregate.version,
    },
    attempts: value.attempts,
    failureCode: value.failureCode,
    occurredAt: value.occurredAt,
    deadLetteredAt: value.deadLetteredAt,
  };
}

export async function loadDeadLetters(accessToken: string, filters: DeadLetterFilters): Promise<DeadLetterPage> {
  const query = new URLSearchParams({ limit: String(maximumPageItems) });
  if (filters.tenantId) query.set("tenantId", filters.tenantId);
  if (filters.eventName) query.set("eventName", filters.eventName);
  if (filters.aggregateType) query.set("aggregateType", filters.aggregateType);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.cursor) query.set("cursor", filters.cursor);

  const response = await fetch(
    `${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/outbox-dead-letters?${query.toString()}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error("Dead-letter response is unexpectedly large");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
    throw new Error("Dead-letter response is unexpectedly large");
  }

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Dead-letter API returned invalid JSON");
  }
  if (!response.ok) throw new Error(`Dead-letter API failed with status ${response.status}`);
  if (!isRecord(document)
    || !Array.isArray(document.items)
    || document.items.length > maximumPageItems
    || !isRecord(document.page)
    || !nonNegativeInteger(document.page.limit)
    || document.page.limit < 1
    || document.page.limit > maximumPageItems
    || (document.page.nextCursor !== undefined && !nonEmptyString(document.page.nextCursor, 512))) {
    throw new Error("Dead-letter page did not match the API contract");
  }

  return {
    items: document.items.map(parseEvent),
    page: {
      limit: document.page.limit,
      ...(document.page.nextCursor ? { nextCursor: document.page.nextCursor } : {}),
    },
  };
}
