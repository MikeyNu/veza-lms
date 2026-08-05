export type OutboxTransport = "eventbridge" | "stdout";

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly transport: OutboxTransport;
  readonly eventBusName?: string;
  readonly eventSource: string;
  readonly batchSize: number;
  readonly pollIntervalMs: number;
  readonly leaseSeconds: number;
  readonly maximumAttempts: number;
  readonly retryBaseSeconds: number;
  readonly retryMaximumSeconds: number;
  readonly workerId: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function loadWorkerConfig(): WorkerConfig {
  const transport = (process.env.OUTBOX_TRANSPORT?.trim() || "stdout") as OutboxTransport;
  if (transport !== "eventbridge" && transport !== "stdout") throw new Error("OUTBOX_TRANSPORT must be eventbridge or stdout");
  if (process.env.NODE_ENV === "production" && transport === "stdout") {
    throw new Error("OUTBOX_TRANSPORT=stdout is prohibited in production");
  }
  const eventBusName = process.env.EVENTBRIDGE_EVENT_BUS_NAME?.trim();
  if (transport === "eventbridge" && !eventBusName) throw new Error("EVENTBRIDGE_EVENT_BUS_NAME is required for EventBridge delivery");
  const workerId = process.env.WORKER_INSTANCE_ID?.trim() || `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
  if (!/^[A-Za-z0-9._:-]{3,160}$/.test(workerId)) throw new Error("WORKER_INSTANCE_ID contains unsupported characters");
  return {
    databaseUrl: required("WORKER_DATABASE_URL"),
    transport,
    ...(eventBusName ? { eventBusName } : {}),
    eventSource: process.env.EVENTBRIDGE_EVENT_SOURCE?.trim() || "veza.learning-cloud",
    batchSize: positiveInteger("OUTBOX_BATCH_SIZE", 50, 500),
    pollIntervalMs: positiveInteger("OUTBOX_POLL_INTERVAL_MS", 1_000, 60_000),
    leaseSeconds: positiveInteger("OUTBOX_LEASE_SECONDS", 60, 3_600),
    maximumAttempts: positiveInteger("OUTBOX_MAXIMUM_ATTEMPTS", 12, 100),
    retryBaseSeconds: positiveInteger("OUTBOX_RETRY_BASE_SECONDS", 5, 3_600),
    retryMaximumSeconds: positiveInteger("OUTBOX_RETRY_MAXIMUM_SECONDS", 3_600, 86_400),
    workerId,
  };
}
