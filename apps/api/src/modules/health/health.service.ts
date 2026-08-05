import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../platform/database/database.service.js";

interface OutboxHealthRow extends QueryResultRow {
  readonly pending_events: number | string;
  readonly dead_letter_events: number | string;
  readonly oldest_pending_seconds: number | string;
}

export type HealthState = "live" | "ready" | "degraded" | "not-ready";
export type ComponentState = "up" | "degraded" | "down";

export interface LivenessResponse {
  readonly status: "live";
  readonly service: "veza-api";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
}

export interface ReadinessResponse {
  readonly status: Exclude<HealthState, "live">;
  readonly service: "veza-api";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
  readonly checks: {
    readonly database: { readonly status: ComponentState; readonly latencyMs: number };
    readonly eventDelivery: {
      readonly status: ComponentState;
      readonly pendingEvents: number;
      readonly deadLetterEvents: number;
      readonly oldestPendingSeconds: number;
    };
  };
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(private readonly database: DatabaseService) {}

  liveness(): LivenessResponse {
    return {
      status: "live",
      service: "veza-api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const started = performance.now();
    try {
      await this.database.controlPlaneQuery("SELECT 1 AS ready");
      const databaseLatencyMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
      const result = await this.database.controlPlaneQuery<OutboxHealthRow>(
        `SELECT count(*) FILTER (
                  WHERE published_at IS NULL AND dead_lettered_at IS NULL
                )::int AS pending_events,
                count(*) FILTER (
                  WHERE dead_lettered_at IS NOT NULL
                )::int AS dead_letter_events,
                COALESCE(
                  EXTRACT(EPOCH FROM (
                    now() - min(occurred_at) FILTER (
                      WHERE published_at IS NULL AND dead_lettered_at IS NULL
                    )
                  )),
                  0
                )::float8 AS oldest_pending_seconds
         FROM outbox_events`,
      );
      const pendingEvents = Number(result.rows[0]?.pending_events ?? 0);
      const deadLetterEvents = Number(result.rows[0]?.dead_letter_events ?? 0);
      const oldestPendingSeconds = Math.max(0, Math.floor(Number(result.rows[0]?.oldest_pending_seconds ?? 0)));
      const maximumPendingEvents = nonNegativeNumber(process.env.OUTBOX_DEGRADED_PENDING_EVENTS, 500);
      const maximumOldestSeconds = nonNegativeNumber(process.env.OUTBOX_DEGRADED_AGE_SECONDS, 300);
      const eventDeliveryStatus: ComponentState = deadLetterEvents > 0
        || pendingEvents > maximumPendingEvents
        || oldestPendingSeconds > maximumOldestSeconds
        ? "degraded"
        : "up";

      return {
        status: eventDeliveryStatus === "degraded" ? "degraded" : "ready",
        service: "veza-api",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
        checks: {
          database: { status: "up", latencyMs: databaseLatencyMs },
          eventDelivery: { status: eventDeliveryStatus, pendingEvents, deadLetterEvents, oldestPendingSeconds },
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "not-ready",
        service: "veza-api",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
        checks: {
          database: { status: "down", latencyMs: Math.max(0, Math.round((performance.now() - started) * 10) / 10) },
          eventDelivery: { status: "down", pendingEvents: 0, deadLetterEvents: 0, oldestPendingSeconds: 0 },
        },
      } satisfies ReadinessResponse);
    }
  }
}
