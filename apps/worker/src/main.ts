import { Pool } from "pg";
import { loadWorkerConfig } from "./config.js";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { EventBridgePublisher, StdoutPublisher } from "./event-publisher.js";
import { OutboxRepository } from "./outbox-repository.js";
import type { ClaimedOutboxEvent, EventPublisher, PublishResult } from "./outbox.types.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";

function log(level: "info" | "warn" | "error", message: string, metadata: Readonly<Record<string, unknown>> = {}): void {
  const output = JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...metadata });
  (level === "error" ? process.stderr : process.stdout).write(`${output}\n`);
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function publisher(config: ReturnType<typeof loadWorkerConfig>): EventPublisher {
  return config.transport === "eventbridge"
    ? new EventBridgePublisher(
        config.eventBusName ?? "",
        config.eventSource,
        config.eventBridgeRequestTimeoutMs,
        config.awsRegion ?? "",
      )
    : new StdoutPublisher();
}

async function acknowledge(
  repository: OutboxRepository,
  owner: string,
  event: ClaimedOutboxEvent,
  result: PublishResult | undefined,
  maximumAttempts: number,
  retryBaseSeconds: number,
  retryMaximumSeconds: number,
): Promise<void> {
  if (result?.success) {
    const updated = await repository.markPublished(owner, event.id, result.reference);
    if (!updated) log("warn", "Outbox acknowledgement lost its lease", { eventId: event.id });
    return;
  }

  const deadLetter = event.attempts >= maximumAttempts;
  const error = sanitizeDeliveryError(result?.error ?? "Publisher returned no result for the claimed event");
  const delaySeconds = retryDelaySeconds(event.id, event.attempts, retryBaseSeconds, retryMaximumSeconds);
  const updated = await repository.markFailed(owner, event, error, nextAttemptAt(new Date(), delaySeconds), deadLetter);
  if (!updated) {
    log("warn", "Outbox failure acknowledgement lost its lease", { eventId: event.id });
  } else {
    log(deadLetter ? "error" : "warn", deadLetter ? "Outbox event moved to dead letter" : "Outbox delivery scheduled for retry", {
      eventId: event.id,
      tenantId: event.tenantId,
      eventName: event.eventName,
      attempts: event.attempts,
      ...(deadLetter ? {} : { retryInSeconds: delaySeconds }),
      error,
    });
  }
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    application_name: "veza-outbox-worker",
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  pool.on("error", (error) => log("error", "Unexpected PostgreSQL pool error", { error: sanitizeDeliveryError(error) }));
  const repository = new OutboxRepository(pool);
  const eventPublisher = publisher(config);
  const shutdown = new AbortController();
  const stop = (signal: string) => {
    log("info", "Outbox worker shutdown requested", { signal });
    shutdown.abort();
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  log("info", "Outbox worker started", {
    workerId: config.workerId,
    transport: config.transport,
    batchSize: config.batchSize,
    leaseSeconds: config.leaseSeconds,
  });

  try {
    while (!shutdown.signal.aborted) {
      try {
        const events = await repository.claim(config.workerId, config.batchSize, config.leaseSeconds);
        if (events.length === 0) {
          await wait(config.pollIntervalMs, shutdown.signal);
          continue;
        }
        const published = await eventPublisher.publish(events);
        const byEventId = new Map(published.map((result) => [result.eventId, result]));
        for (const event of events) {
          await acknowledge(
            repository,
            config.workerId,
            event,
            byEventId.get(event.id),
            config.maximumAttempts,
            config.retryBaseSeconds,
            config.retryMaximumSeconds,
          );
        }
        const succeeded = published.filter((result) => result.success).length;
        log("info", "Outbox batch processed", { claimed: events.length, succeeded, failed: events.length - succeeded });
      } catch (error) {
        log("error", "Outbox polling cycle failed", { error: sanitizeDeliveryError(error) });
        await wait(config.pollIntervalMs, shutdown.signal);
      }
    }
  } finally {
    await pool.end();
    log("info", "Outbox worker stopped");
  }
}

void main().catch((error: unknown) => {
  log("error", "Outbox worker failed to start", { error: sanitizeDeliveryError(error) });
  process.exitCode = 1;
});
