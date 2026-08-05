const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumResponseBytes = 512 * 1024;

export interface EventPlatformOverview {
  readonly generatedAt: string;
  readonly summary: {
    readonly backlogCount: number;
    readonly deadLetterCount: number;
    readonly oldestBacklogAt: string | null;
    readonly delivered24h: number;
  };
  readonly consumers: readonly {
    readonly consumerKey: string;
    readonly displayName: string;
    readonly destinationType: string;
    readonly status: string;
    readonly maximumAttempts: number;
    readonly pendingCount: number;
    readonly deadLetterCount: number;
    readonly oldestPendingAt: string | null;
    readonly lastCompletedAt: string | null;
  }[];
  readonly reconciliationRuns: readonly Readonly<Record<string, unknown>>[];
  readonly recentDeliveries: readonly Readonly<Record<string, unknown>>[];
}

export interface EventSchemaView extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly event_name: string;
  readonly major_version: number;
  readonly minor_version: number;
  readonly owner_context: string;
  readonly classification: string;
  readonly compatibility: string;
  readonly status: string;
  readonly version: number;
}

async function boundedJson<T>(response: Response): Promise<T> {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumResponseBytes) {
    throw new Error("Event platform response is unexpectedly large");
  }
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Event platform response is unexpectedly large");
  const body = JSON.parse(text) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Event platform request failed with ${response.status}`);
  return body;
}

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return boundedJson<T>(response);
}

export async function loadEventPlatform(accessToken: string): Promise<{
  readonly overview: EventPlatformOverview;
  readonly schemas: readonly EventSchemaView[];
}> {
  const [overview, schemas] = await Promise.all([
    request<EventPlatformOverview>(accessToken, "/v1/control-plane/events/overview"),
    request<readonly EventSchemaView[]>(accessToken, "/v1/control-plane/events/schemas"),
  ]);
  return { overview, schemas };
}

export async function mutateEventPlatform(
  accessToken: string,
  operation: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<Readonly<Record<string, unknown>>> {
  const paths: Readonly<Record<string, string>> = {
    "schema-create": "/v1/control-plane/events/schemas",
    "consumer-create": "/v1/control-plane/events/consumers",
    "schedule-create": "/v1/control-plane/events/schedules",
  };
  const direct = paths[operation];
  const schemaSubmit = operation.match(/^schema-submit:([0-9a-f-]{36})$/i);
  const schemaApprove = operation.match(/^schema-approve:([0-9a-f-]{36})$/i);
  const replay = operation.match(/^replay:([0-9a-f-]{36})$/i);
  const consumerStatus = operation.match(/^consumer-status:([a-z0-9.-]{3,120})$/i);
  const path = direct
    ?? (schemaSubmit ? `/v1/control-plane/events/schemas/${schemaSubmit[1]}/submit` : undefined)
    ?? (schemaApprove ? `/v1/control-plane/events/schemas/${schemaApprove[1]}/approve` : undefined)
    ?? (replay ? `/v1/control-plane/events/${replay[1]}/replay` : undefined)
    ?? (consumerStatus ? `/v1/control-plane/events/consumers/${consumerStatus[1]}/status` : undefined);
  if (!path) throw new Error("Event platform operation is invalid");
  return request(accessToken, path, {
    method: "POST",
    body: JSON.stringify(input),
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
  });
}
