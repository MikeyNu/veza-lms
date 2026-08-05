import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { CacheService } from "../cache/cache.service.js";
import { DatabaseService } from "../database/database.service.js";

interface DependencyState {
  readonly name: string;
  readonly status: "ready" | "degraded" | "unavailable";
  readonly latencyMs: number;
  readonly detail?: string;
}

interface RequestObservationInput {
  readonly tenantId?: string;
  readonly actorId?: string;
  readonly route: string;
  readonly method: string;
  readonly statusCode: number;
  readonly latencyMs: number;
  readonly requestBytes: number;
  readonly responseBytes: number;
  readonly correlationId: string;
  readonly traceId?: string;
  readonly errorCode?: string;
}

function safeMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/g, "[token]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .slice(0, 1000);
}

function traceId(): string {
  return randomBytes(16).toString("hex");
}

function spanId(): string {
  return randomBytes(8).toString("hex");
}

@Injectable()
export class ObservabilityService {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();
  private readonly serviceName = "veza-api";
  private readonly environment = process.env.VEZA_ENVIRONMENT_LABEL ?? "local";
  private readonly releaseVersion = process.env.VEZA_RELEASE_VERSION ?? "development";

  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  liveness() {
    return {
      status: "live",
      service: this.serviceName,
      environment: this.environment,
      releaseVersion: this.releaseVersion,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async readiness() {
    const dependencies = await Promise.all([
      this.postgresHealth(),
      this.redisHealth(),
      this.identityHealth(),
      this.storageHealth(),
      this.workerHealth(),
      this.backlogHealth(),
    ]);
    const unavailable = dependencies.filter((item) => item.status === "unavailable");
    const degraded = dependencies.filter((item) => item.status === "degraded");
    return {
      status: unavailable.length > 0 ? "unavailable" : degraded.length > 0 ? "degraded" : "ready",
      ready: unavailable.length === 0,
      service: this.serviceName,
      environment: this.environment,
      releaseVersion: this.releaseVersion,
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  createTrace(parentTraceparent?: string): {
    readonly traceId: string;
    readonly spanId: string;
    readonly traceparent: string;
    readonly parentSpanId?: string;
  } {
    const matched = parentTraceparent?.match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i);
    const trace = matched?.[1]?.toLowerCase() ?? traceId();
    const span = spanId();
    return {
      traceId: trace,
      spanId: span,
      traceparent: `00-${trace}-${span}-01`,
      ...(matched?.[2] ? { parentSpanId: matched[2].toLowerCase() } : {}),
    };
  }

  async recordRequest(input: RequestObservationInput): Promise<void> {
    this.increment("veza_api_requests_total", {
      method: input.method,
      status: String(input.statusCode),
      route: input.route,
    });
    this.observe("veza_api_request_duration_ms", input.latencyMs, {
      method: input.method,
      route: input.route,
    });
    await this.database.controlPlaneQuery(
      `INSERT INTO request_observations (
         tenant_id, actor_id, service_name, route_template, method,
         status_code, latency_ms, request_bytes, response_bytes,
         correlation_id, trace_id, error_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        input.tenantId ?? null,
        input.actorId ?? null,
        this.serviceName,
        input.route,
        input.method,
        input.statusCode,
        input.latencyMs,
        input.requestBytes,
        input.responseBytes,
        input.correlationId,
        input.traceId ?? null,
        input.errorCode ?? null,
      ],
    ).catch(() => undefined);
  }

  async recordSecurity(
    observationType: "authentication-failure" | "authorization-denial" | "rls-denial" | "webhook-signature-failure" | "quota-denial",
    input: {
      readonly tenantId?: string;
      readonly actorId?: string;
      readonly route?: string;
      readonly reasonCode: string;
      readonly source?: string;
      readonly correlationId: string;
    },
  ): Promise<void> {
    this.increment("veza_security_observations_total", {
      type: observationType,
      reason: input.reasonCode,
    });
    await this.database.controlPlaneQuery(
      `INSERT INTO security_observations (
         tenant_id, actor_id, observation_type, route_template,
         reason_code, source_hash, correlation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.tenantId ?? null,
        input.actorId ?? null,
        observationType,
        input.route ?? null,
        input.reasonCode,
        input.source
          ? createHash("sha256").update(input.source, "utf8").digest("hex")
          : null,
        input.correlationId,
      ],
    ).catch(() => undefined);
  }

  async reportError(
    error: unknown,
    input: {
      readonly tenantId?: string;
      readonly route?: string;
      readonly correlationId?: string;
      readonly traceId?: string;
    },
  ): Promise<void> {
    const errorClass = error instanceof Error ? error.name : typeof error;
    const message = safeMessage(error);
    const fingerprint = createHash("sha256")
      .update(`${errorClass}\n${input.route ?? ""}\n${message}`, "utf8")
      .digest("hex");
    await this.database.controlPlaneQuery(
      `INSERT INTO platform_error_reports (
         tenant_id, service_name, environment, release_version,
         error_class, error_fingerprint, message_summary,
         route_template, correlation_id, trace_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (
         service_name, environment, release_version, error_fingerprint, state
       ) DO UPDATE SET occurrence_count = platform_error_reports.occurrence_count + 1,
                       last_seen_at = now()`,
      [
        input.tenantId ?? null,
        this.serviceName,
        this.environment,
        this.releaseVersion,
        errorClass,
        fingerprint,
        message,
        input.route ?? null,
        input.correlationId ?? null,
        input.traceId ?? null,
      ],
    ).catch(() => undefined);
  }

  async exportSpan(input: {
    readonly traceId: string;
    readonly spanId: string;
    readonly parentSpanId?: string;
    readonly name: string;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly statusCode: number;
    readonly attributes: Readonly<Record<string, string | number | boolean>>;
  }): Promise<void> {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, "");
    if (!endpoint) return;
    const nanos = (milliseconds: number) => `${BigInt(milliseconds) * 1_000_000n}`;
    await fetch(`${endpoint}/v1/traces`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.OTEL_EXPORTER_OTLP_HEADERS
          ? Object.fromEntries(
              process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",").map((entry) => {
                const [key, ...values] = entry.split("=");
                return [key.trim(), values.join("=").trim()];
              }),
            )
          : {}),
      },
      body: JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: this.serviceName } },
                { key: "deployment.environment.name", value: { stringValue: this.environment } },
                { key: "service.version", value: { stringValue: this.releaseVersion } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: "veza.api", version: "1.0.0" },
                spans: [
                  {
                    traceId: input.traceId,
                    spanId: input.spanId,
                    ...(input.parentSpanId ? { parentSpanId: input.parentSpanId } : {}),
                    name: input.name,
                    kind: 2,
                    startTimeUnixNano: nanos(input.startedAt),
                    endTimeUnixNano: nanos(input.endedAt),
                    attributes: Object.entries(input.attributes).map(([key, value]) => ({
                      key,
                      value:
                        typeof value === "number"
                          ? { doubleValue: value }
                          : typeof value === "boolean"
                            ? { boolValue: value }
                            : { stringValue: value },
                    })),
                    status: { code: input.statusCode >= 500 ? 2 : 1 },
                  },
                ],
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => undefined);
  }

  async prometheus(): Promise<string> {
    const backlog = await this.database.controlPlaneQuery(
      `SELECT
         (SELECT count(*) FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL) outbox_backlog,
         (SELECT count(*) FROM outbox_events WHERE dead_lettered_at IS NOT NULL) outbox_dead_letters,
         (SELECT count(*) FROM event_consumer_inbox WHERE state IN ('pending','retry','processing')) consumer_lag,
         (SELECT count(*) FROM notification_deliveries WHERE state IN ('pending','retry','processing')) notification_backlog,
         (SELECT count(*) FROM media_processing_jobs WHERE state IN ('pending','retry','processing')) media_backlog,
         (SELECT count(*) FROM search_index_operations WHERE state IN ('pending','retry','processing')) search_backlog`,
    );
    const row = backlog.rows[0] ?? {};
    const lines = [
      "# HELP veza_outbox_backlog Unpublished transactional outbox events",
      "# TYPE veza_outbox_backlog gauge",
      `veza_outbox_backlog ${Number(row.outbox_backlog ?? 0)}`,
      "# HELP veza_outbox_dead_letters Dead-lettered outbox events",
      "# TYPE veza_outbox_dead_letters gauge",
      `veza_outbox_dead_letters ${Number(row.outbox_dead_letters ?? 0)}`,
      "# HELP veza_consumer_lag Pending consumer inbox entries",
      "# TYPE veza_consumer_lag gauge",
      `veza_consumer_lag ${Number(row.consumer_lag ?? 0)}`,
      `veza_notification_backlog ${Number(row.notification_backlog ?? 0)}`,
      `veza_media_processing_backlog ${Number(row.media_backlog ?? 0)}`,
      `veza_search_index_backlog ${Number(row.search_backlog ?? 0)}`,
    ];
    for (const [key, value] of this.counters) lines.push(`${key} ${value}`);
    for (const [key, values] of this.histograms) {
      if (values.length === 0) continue;
      lines.push(`${key}_count ${values.length}`);
      lines.push(`${key}_sum ${values.reduce((sum, value) => sum + value, 0)}`);
    }
    return `${lines.join("\n")}\n`;
  }

  async operationsOverview() {
    const [heartbeats, slos, alerts, errors] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT runtime_key, runtime_type, environment, release_version,
                instance_id, status, capabilities, started_at, last_seen_at,
                EXTRACT(EPOCH FROM (now()-last_seen_at))::integer age_seconds
         FROM platform_runtime_heartbeats ORDER BY runtime_type, runtime_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT definition.service_name, definition.slo_key,
                definition.display_name, definition.objective,
                measurement.achieved, measurement.error_budget_remaining,
                measurement.burn_rate_1h, measurement.burn_rate_6h,
                measurement.measured_at
         FROM slo_definitions definition
         LEFT JOIN LATERAL (
           SELECT * FROM slo_measurements
           WHERE slo_definition_id = definition.id
           ORDER BY measured_at DESC LIMIT 1
         ) measurement ON true
         WHERE definition.status = 'active'
         ORDER BY definition.service_name, definition.slo_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT event.id, rule.alert_key, rule.display_name, rule.severity,
                event.state, event.summary, event.fired_at,
                event.acknowledged_at, event.resolved_at
         FROM alert_events event
         JOIN alert_rules rule ON rule.id = event.alert_rule_id
         WHERE event.state <> 'resolved'
         ORDER BY CASE rule.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                  event.fired_at DESC
         LIMIT 100`,
      ),
      this.database.controlPlaneQuery(
        `SELECT service_name, environment, release_version, error_class,
                message_summary, occurrence_count, first_seen_at,
                last_seen_at, state
         FROM platform_error_reports
         WHERE state IN ('open','acknowledged')
         ORDER BY last_seen_at DESC LIMIT 100`,
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      heartbeats: heartbeats.rows,
      slos: slos.rows,
      alerts: alerts.rows,
      errors: errors.rows,
    };
  }

  increment(name: string, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  observe(name: string, value: number, labels: Readonly<Record<string, string>> = {}): void {
    const key = this.metricKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    if (values.length > 10_000) values.splice(0, values.length - 10_000);
    this.histograms.set(key, values);
  }

  private metricKey(name: string, labels: Readonly<Record<string, string>>): string {
    const entries = Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}="${value.replaceAll('"', '\\"')}"`);
    return entries.length ? `${name}{${entries.join(",")}}` : name;
  }

  private async postgresHealth(): Promise<DependencyState> {
    const startedAt = Date.now();
    try {
      await this.database.controlPlaneQuery("SELECT 1 ready");
      return { name: "postgresql", status: "ready", latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { name: "postgresql", status: "unavailable", latencyMs: Date.now() - startedAt, detail: safeMessage(error) };
    }
  }

  private async redisHealth(): Promise<DependencyState> {
    const result = await this.cache.health();
    return {
      name: "redis",
      status: result.available ? "ready" : "unavailable",
      latencyMs: result.latencyMs,
      ...(result.available ? {} : { detail: "Redis did not acknowledge PING" }),
    };
  }

  private async identityHealth(): Promise<DependencyState> {
    const startedAt = Date.now();
    const issuer = process.env.OIDC_ISSUER_URL?.replace(/\/$/, "");
    if (!issuer) return { name: "identity", status: "unavailable", latencyMs: 0, detail: "OIDC_ISSUER_URL is not configured" };
    try {
      const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(3_000),
      });
      return {
        name: "identity",
        status: response.ok ? "ready" : "unavailable",
        latencyMs: Date.now() - startedAt,
        ...(response.ok ? {} : { detail: `Identity discovery returned HTTP ${response.status}` }),
      };
    } catch (error) {
      return { name: "identity", status: "unavailable", latencyMs: Date.now() - startedAt, detail: safeMessage(error) };
    }
  }

  private async storageHealth(): Promise<DependencyState> {
    const startedAt = Date.now();
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
    if (!endpoint) return { name: "object-storage", status: "unavailable", latencyMs: 0, detail: "OBJECT_STORAGE_ENDPOINT is not configured" };
    try {
      const response = await fetch(endpoint, { method: "HEAD", signal: AbortSignal.timeout(3_000) });
      return {
        name: "object-storage",
        status: response.status < 500 ? "ready" : "unavailable",
        latencyMs: Date.now() - startedAt,
        ...(response.status < 500 ? {} : { detail: `Storage endpoint returned HTTP ${response.status}` }),
      };
    } catch (error) {
      return { name: "object-storage", status: "unavailable", latencyMs: Date.now() - startedAt, detail: safeMessage(error) };
    }
  }

  private async workerHealth(): Promise<DependencyState> {
    const startedAt = Date.now();
    const result = await this.database.controlPlaneQuery(
      `SELECT max(last_seen_at) last_seen_at
       FROM platform_runtime_heartbeats WHERE runtime_type = 'worker'`,
    );
    const seen = result.rows[0]?.last_seen_at ? Date.parse(result.rows[0].last_seen_at) : 0;
    const ageSeconds = seen ? Math.floor((Date.now() - seen) / 1000) : Number.POSITIVE_INFINITY;
    return {
      name: "worker",
      status: ageSeconds <= 120 ? "ready" : ageSeconds <= 300 ? "degraded" : "unavailable",
      latencyMs: Date.now() - startedAt,
      detail: Number.isFinite(ageSeconds) ? `Last heartbeat ${ageSeconds} seconds ago` : "No worker heartbeat recorded",
    };
  }

  private async backlogHealth(): Promise<DependencyState> {
    const startedAt = Date.now();
    const result = await this.database.controlPlaneQuery(
      `SELECT count(*) backlog, min(occurred_at) oldest_at
       FROM outbox_events
       WHERE published_at IS NULL AND dead_lettered_at IS NULL`,
    );
    const backlog = Number(result.rows[0]?.backlog ?? 0);
    const oldest = result.rows[0]?.oldest_at ? Date.parse(result.rows[0].oldest_at) : Date.now();
    const ageSeconds = Math.max(0, Math.floor((Date.now() - oldest) / 1000));
    return {
      name: "event-delivery",
      status: backlog > 10_000 || ageSeconds > 900 ? "unavailable" : backlog > 1_000 || ageSeconds > 300 ? "degraded" : "ready",
      latencyMs: Date.now() - startedAt,
      detail: `${backlog} unpublished events; oldest ${ageSeconds} seconds`,
    };
  }
}
