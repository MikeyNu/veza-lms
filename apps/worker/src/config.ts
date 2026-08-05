export type OutboxTransport = "eventbridge" | "stdout";

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly transport: OutboxTransport;
  readonly eventBusName?: string;
  readonly eventSource: string;
  readonly awsRegion?: string;
  readonly eventBridgeRequestTimeoutMs: number;
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

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
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
  const awsRegion = process.env.AWS_REGION?.trim();
  if (transport === "eventbridge" && !eventBusName) throw new Error("EVENTBRIDGE_EVENT_BUS_NAME is required for EventBridge delivery");
  if (transport === "eventbridge" && !awsRegion) throw new Error("AWS_REGION is required for EventBridge delivery");
  if (eventBusName && eventBusName.length > 256) throw new Error("EVENTBRIDGE_EVENT_BUS_NAME must not exceed 256 characters");

  const eventSource = process.env.EVENTBRIDGE_EVENT_SOURCE?.trim() || "veza.learning-cloud";
  if (eventSource.length > 256) throw new Error("EVENTBRIDGE_EVENT_SOURCE must not exceed 256 characters");
  const workerId = process.env.WORKER_INSTANCE_ID?.trim() || `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
  if (!/^[A-Za-z0-9._:-]{3,160}$/.test(workerId)) throw new Error("WORKER_INSTANCE_ID contains unsupported characters");

  const leaseSeconds = boundedInteger("OUTBOX_LEASE_SECONDS", 60, 10, 3_600);
  const eventBridgeRequestTimeoutMs = boundedInteger("EVENTBRIDGE_REQUEST_TIMEOUT_MS", 15_000, 1_000, 60_000);
  if (transport === "eventbridge" && eventBridgeRequestTimeoutMs >= leaseSeconds * 1_000) {
    throw new Error("EVENTBRIDGE_REQUEST_TIMEOUT_MS must be shorter than the outbox lease");
  }

  return {
    databaseUrl: required("WORKER_DATABASE_URL"),
    transport,
    ...(eventBusName ? { eventBusName } : {}),
    ...(awsRegion ? { awsRegion } : {}),
    eventSource,
    eventBridgeRequestTimeoutMs,
    batchSize: boundedInteger("OUTBOX_BATCH_SIZE", 10, 1, 10),
    pollIntervalMs: boundedInteger("OUTBOX_POLL_INTERVAL_MS", 1_000, 100, 60_000),
    leaseSeconds,
    maximumAttempts: boundedInteger("OUTBOX_MAXIMUM_ATTEMPTS", 12, 1, 100),
    retryBaseSeconds: boundedInteger("OUTBOX_RETRY_BASE_SECONDS", 5, 1, 3_600),
    retryMaximumSeconds: boundedInteger("OUTBOX_RETRY_MAXIMUM_SECONDS", 3_600, 1, 86_400),
    workerId,
  };
}
