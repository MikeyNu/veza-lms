import { Pool } from "pg";
import { loadWorkerConfig } from "./config.js";
import { ConsumerRepository } from "./consumer-repository.js";
import { ConsumerRuntime } from "./consumer-runtime.js";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { EventBridgePublisher, StdoutPublisher } from "./event-publisher.js";
import { ExportExpiryHandler, ExportProcessor, HttpExportObjectStore } from "./export-processor.js";
import { MediaProcessor } from "./media-processor.js";
import { MediaRetentionReconciliationHandler } from "./media-scheduler.js";
import { CoreMetricRefresher } from "./metric-refresh.js";
import { NotificationDispatcher } from "./notification-dispatcher.js";
import { NotificationProviderRegistry } from "./notification-provider.js";
import { NotificationRouter } from "./notification-router.js";
import { NotificationDigestPreparationHandler } from "./notification-scheduler.js";
import {
  AlertEvaluationHandler,
  ApiRuntimeCleanupHandler,
  SloMeasurementHandler,
  WorkerHeartbeat,
} from "./observability-runtime.js";
import { OutboxRepository } from "./outbox-repository.js";
import type { ClaimedOutboxEvent, EventPublisher, PublishResult } from "./outbox.types.js";
import { PlatformScheduleReconciler } from "./platform-schedule-reconciler.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";
import { PlatformGovernanceSweepHandler, WorkerScheduler } from "./scheduler.js";
import {
  SearchIndexPublisher,
  SearchProjectionEventHandler,
  SearchProjectionScheduleHandler,
} from "./search-runtime.js";
import {
  WebhookDispatcher,
  WebhookReconciliationHandler,
  WebhookRouter,
} from "./webhook-runtime.js";

function log(
  level: "info" | "warn" | "error",
  message: string,
  metadata: Readonly<Record<string, unknown>> = {},
): void {
  const output = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    service: "veza-worker",
    ...metadata,
  });
  (level === "error" ? process.stderr : process.stdout).write(`${output}\n`);
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
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

function destinationKey(config: ReturnType<typeof loadWorkerConfig>): string {
  return config.transport === "eventbridge"
    ? `eventbridge:${config.eventBusName ?? "unknown"}`
    : "stdout:local";
}

async function acknowledge(
  repository: OutboxRepository,
  owner: string,
  event: ClaimedOutboxEvent,
  result: PublishResult | undefined,
  config: ReturnType<typeof loadWorkerConfig>,
  latencyMs: number,
): Promise<void> {
  const destination = destinationKey(config);
  if (result?.success) {
    const updated = await repository.markPublished(
      owner,
      event,
      destination,
      result.reference,
      latencyMs,
    );
    if (!updated) log("warn", "Outbox acknowledgement lost its lease", { eventId: event.id });
    return;
  }

  const deadLetter = event.attempts >= config.maximumAttempts;
  const error = sanitizeDeliveryError(
    result?.error ?? "Publisher returned no result for the claimed event",
  );
  const delaySeconds = retryDelaySeconds(
    event.id,
    event.attempts,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  const updated = await repository.markFailed(
    owner,
    event,
    destination,
    error,
    nextAttemptAt(new Date(), delaySeconds),
    deadLetter,
    latencyMs,
  );
  if (!updated) {
    log("warn", "Outbox failure acknowledgement lost its lease", { eventId: event.id });
  } else {
    log(
      deadLetter ? "error" : "warn",
      deadLetter ? "Outbox event moved to dead letter" : "Outbox delivery scheduled for retry",
      {
        eventId: event.id,
        tenantId: event.tenantId,
        eventName: event.eventName,
        attempts: event.attempts,
        ...(deadLetter ? {} : { retryInSeconds: delaySeconds }),
        error,
      },
    );
  }
}

async function processOutbox(
  repository: OutboxRepository,
  eventPublisher: EventPublisher,
  config: ReturnType<typeof loadWorkerConfig>,
): Promise<number> {
  const events = await repository.claim(config.workerId, config.batchSize, config.leaseSeconds);
  if (events.length === 0) return 0;
  const startedAt = Date.now();
  const published = await eventPublisher.publish(events);
  const latencyMs = Date.now() - startedAt;
  const byEventId = new Map(published.map((result) => [result.eventId, result]));
  for (const event of events) {
    await acknowledge(
      repository,
      config.workerId,
      event,
      byEventId.get(event.id),
      config,
      latencyMs,
    );
  }
  const succeeded = published.filter((result) => result.success).length;
  log("info", "Outbox batch processed", {
    claimed: events.length,
    succeeded,
    failed: events.length - succeeded,
    latencyMs,
  });
  return events.length;
}

async function safeHeartbeat(
  heartbeat: WorkerHeartbeat,
  status: "starting" | "ready" | "degraded" | "stopping",
): Promise<void> {
  try {
    await heartbeat.beat(status);
  } catch (error) {
    log("warn", "Worker heartbeat update failed", {
      status,
      error: sanitizeDeliveryError(error),
    });
  }
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    application_name: "veza-platform-worker",
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  pool.on("error", (error) =>
    log("error", "Unexpected PostgreSQL pool error", { error: sanitizeDeliveryError(error) }),
  );

  const outboxRepository = new OutboxRepository(pool);
  const eventPublisher = publisher(config);
  const consumerRuntime = new ConsumerRuntime(
    new ConsumerRepository(pool),
    config.workerId,
    config.consumerBatchSize,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  consumerRuntime.register("communications.notification-router", new NotificationRouter(pool));
  consumerRuntime.register("search.projection-events", new SearchProjectionEventHandler(pool));
  consumerRuntime.register("api.webhook-router", new WebhookRouter(pool));

  const scheduler = new WorkerScheduler(
    pool,
    config.workerId,
    config.schedulerBatchSize,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  scheduler.register(
    "communications.digest-preparation",
    new NotificationDigestPreparationHandler(pool),
  );
  scheduler.register(
    "support.session-expiry",
    new PlatformGovernanceSweepHandler(pool, "expire_support_sessions"),
  );
  scheduler.register(
    "commercial.effective-date-sweep",
    new PlatformGovernanceSweepHandler(pool, "apply_due_commercial_policy"),
  );
  scheduler.register(
    "media.retention-reconciliation",
    new MediaRetentionReconciliationHandler(pool),
  );
  scheduler.register(
    "search.projection-reconciliation",
    new SearchProjectionScheduleHandler(pool),
  );
  scheduler.register("observability.slo-measurement", new SloMeasurementHandler(pool));
  scheduler.register("observability.alert-evaluation", new AlertEvaluationHandler(pool));
  scheduler.register("api.runtime-cleanup", new ApiRuntimeCleanupHandler(pool));
  scheduler.register("api.webhook-reconciliation", new WebhookReconciliationHandler(pool));
  scheduler.register("exports.expiry", new ExportExpiryHandler(pool));

  const notificationDispatcher = new NotificationDispatcher(
    pool,
    new NotificationProviderRegistry(),
    config.workerId,
    config.consumerBatchSize,
    config.maximumAttempts,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  const metricRefresher = new CoreMetricRefresher(
    pool,
    config.workerId,
    config.metricRefreshBatchSize,
  );
  const mediaProcessor = new MediaProcessor(
    pool,
    config.workerId,
    config.consumerBatchSize,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  const searchIndexPublisher = new SearchIndexPublisher(
    pool,
    config.workerId,
    config.consumerBatchSize,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  const webhookDispatcher = new WebhookDispatcher(
    pool,
    config.workerId,
    config.consumerBatchSize,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  const exportProcessor = new ExportProcessor(
    pool,
    new HttpExportObjectStore(
      config.exportObjectStoreUrl,
      config.exportObjectStoreToken,
      config.exportObjectStoreTimeoutMs,
    ),
    config.workerId,
    config.exportBatchSize,
    config.exportLeaseSeconds,
    config.exportExpirySeconds,
    config.retryBaseSeconds,
    config.retryMaximumSeconds,
  );
  const platformScheduleReconciler = new PlatformScheduleReconciler(pool);
  const heartbeat = new WorkerHeartbeat(pool, config.workerId);
  const shutdown = new AbortController();
  const stop = (signal: string) => {
    log("info", "Worker shutdown requested", { signal });
    shutdown.abort();
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  let nextMetricRefreshAt = 0;
  let nextSchedulerAt = 0;
  let nextScheduleReconciliationAt = 0;
  let nextHeartbeatAt = 0;
  await safeHeartbeat(heartbeat, "starting");
  const initialSchedules = await platformScheduleReconciler.reconcile();
  nextScheduleReconciliationAt = Date.now() + 60_000;
  log("info", "Worker started", {
    workerId: config.workerId,
    transport: config.transport,
    outboxBatchSize: config.batchSize,
    consumerBatchSize: config.consumerBatchSize,
    schedulerBatchSize: config.schedulerBatchSize,
    exportBatchSize: config.exportBatchSize,
    leaseSeconds: config.leaseSeconds,
    metricRefreshIntervalMs: config.metricRefreshIntervalMs,
    platformSchedules: initialSchedules,
  });

  try {
    while (!shutdown.signal.aborted) {
      try {
        const now = Date.now();
        if (now >= nextHeartbeatAt) {
          await safeHeartbeat(heartbeat, "ready");
          nextHeartbeatAt = now + 30_000;
        }
        if (now >= nextScheduleReconciliationAt) {
          const schedules = await platformScheduleReconciler.reconcile();
          log("info", "Platform schedules reconciled", schedules);
          nextScheduleReconciliationAt = now + 60_000;
        }
        if (now >= nextMetricRefreshAt) {
          const refreshed = await metricRefresher.refreshDue();
          log("info", "Core metric refresh cycle completed", { refreshed });
          nextMetricRefreshAt = now + config.metricRefreshIntervalMs;
        }
        if (now >= nextSchedulerAt) {
          const scheduled = await scheduler.processDue();
          if (scheduled.claimed > 0) log("info", "Scheduled jobs processed", scheduled);
          nextSchedulerAt = now + config.schedulerIntervalMs;
        }

        const [outboxClaimed, consumers, notifications, media, search, webhooks, exports] = await Promise.all([
          processOutbox(outboxRepository, eventPublisher, config),
          consumerRuntime.processDue(),
          notificationDispatcher.processDue(),
          mediaProcessor.processDue(),
          searchIndexPublisher.processDue(),
          webhookDispatcher.processDue(),
          exportProcessor.processDue(),
        ]);
        if (consumers.claimed > 0) log("info", "Event consumers processed", consumers);
        if (
          notifications.intentsPrepared > 0 ||
          notifications.deliveriesProcessed > 0 ||
          notifications.digestsProcessed > 0
        ) {
          log("info", "Notification delivery cycle completed", notifications);
        }
        if (media.claimed > 0) log("info", "Media processing cycle completed", media);
        if (search.claimed > 0) log("info", "Search indexing cycle completed", search);
        if (webhooks.claimed > 0) log("info", "Webhook delivery cycle completed", webhooks);
        if (exports.claimed > 0) log("info", "Governed export cycle completed", exports);
        if (
          outboxClaimed === 0 &&
          consumers.claimed === 0 &&
          notifications.intentsPrepared === 0 &&
          notifications.deliveriesProcessed === 0 &&
          notifications.digestsProcessed === 0 &&
          media.claimed === 0 &&
          search.claimed === 0 &&
          webhooks.claimed === 0 &&
          exports.claimed === 0
        ) {
          await wait(config.pollIntervalMs, shutdown.signal);
        }
      } catch (error) {
        log("error", "Worker polling cycle failed", { error: sanitizeDeliveryError(error) });
        await safeHeartbeat(heartbeat, "degraded");
        await wait(config.pollIntervalMs, shutdown.signal);
      }
    }
  } finally {
    await safeHeartbeat(heartbeat, "stopping");
    await pool.end();
    log("info", "Worker stopped");
  }
}

void main().catch((error: unknown) => {
  log("error", "Worker failed to start", { error: sanitizeDeliveryError(error) });
  process.exitCode = 1;
});
