const maximumResponseBytes = 32 * 1024;
const statuses = new Set<ServiceHealthSnapshot["status"]>(["ready", "degraded", "not-ready"]);
const componentStatuses = new Set<ComponentHealth["status"]>(["up", "degraded", "down"]);

export interface ComponentHealth {
  readonly status: "up" | "degraded" | "down";
}

export interface ServiceHealthSnapshot {
  readonly status: "ready" | "degraded" | "not-ready";
  readonly service: "veza-api";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
  readonly checks: {
    readonly database: ComponentHealth & { readonly latencyMs: number };
    readonly eventDelivery: ComponentHealth & {
      readonly pendingEvents: number;
      readonly oldestPendingSeconds: number;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validate(value: unknown): ServiceHealthSnapshot {
  if (!isRecord(value) || !statuses.has(value.status as ServiceHealthSnapshot["status"]) || value.service !== "veza-api") {
    throw new Error("Service health did not match the API contract");
  }
  if (typeof value.timestamp !== "string" || !Number.isFinite(Date.parse(value.timestamp)) || !nonNegativeNumber(value.uptimeSeconds)) {
    throw new Error("Service health timing did not match the API contract");
  }
  if (!isRecord(value.checks) || !isRecord(value.checks.database) || !isRecord(value.checks.eventDelivery)) {
    throw new Error("Service health checks did not match the API contract");
  }
  const database = value.checks.database;
  const eventDelivery = value.checks.eventDelivery;
  if (!componentStatuses.has(database.status as ComponentHealth["status"]) || !nonNegativeNumber(database.latencyMs)) {
    throw new Error("Database health did not match the API contract");
  }
  if (!componentStatuses.has(eventDelivery.status as ComponentHealth["status"]) || !nonNegativeNumber(eventDelivery.pendingEvents) || !nonNegativeNumber(eventDelivery.oldestPendingSeconds)) {
    throw new Error("Event-delivery health did not match the API contract");
  }
  return {
    status: value.status as ServiceHealthSnapshot["status"],
    service: "veza-api",
    timestamp: value.timestamp,
    uptimeSeconds: value.uptimeSeconds,
    checks: {
      database: { status: database.status as ComponentHealth["status"], latencyMs: database.latencyMs },
      eventDelivery: {
        status: eventDelivery.status as ComponentHealth["status"],
        pendingEvents: eventDelivery.pendingEvents,
        oldestPendingSeconds: eventDelivery.oldestPendingSeconds,
      },
    },
  };
}

export async function loadServiceHealth(): Promise<ServiceHealthSnapshot> {
  const response = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/health/ready`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Service health response is unexpectedly large");
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; } catch { throw new Error("Service health returned invalid JSON"); }
  if (!response.ok && response.status !== 503) throw new Error(`Service health API failed with status ${response.status}`);
  return validate(payload);
}
