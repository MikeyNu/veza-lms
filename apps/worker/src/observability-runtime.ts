import type { Pool } from "pg";
import type { ScheduledJobHandler } from "./scheduler.js";

export class WorkerHeartbeat {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
  ) {}

  async beat(status: "starting" | "ready" | "degraded" | "stopping" = "ready") {
    await this.pool.query(
      `SELECT app.upsert_platform_heartbeat(
         $1,'worker',$2,$3,$4,$5,$6,$7
       )`,
      [
        `worker.${this.workerId}`,
        process.env.VEZA_ENVIRONMENT_LABEL ?? "local",
        process.env.VEZA_RELEASE_VERSION ?? "development",
        this.workerId,
        status,
        [
          "outbox-publisher",
          "event-consumers",
          "scheduled-jobs",
          "notifications",
          "media-processing",
          "search-indexing",
          "metric-refresh",
        ],
        {
          nodeVersion: process.version,
          pid: process.pid,
          uptimeSeconds: Math.floor(process.uptime()),
        },
      ],
    );
  }
}

export class SloMeasurementHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ measured: number }>(
      "SELECT app.measure_platform_slos() measured",
    );
    return { measured: Number(result.rows[0]?.measured ?? 0) };
  }
}

export class AlertEvaluationHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ evaluated: number }>(
      "SELECT app.evaluate_platform_alerts() evaluated",
    );
    return { evaluated: Number(result.rows[0]?.evaluated ?? 0) };
  }
}

export class ApiRuntimeCleanupHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ result: Readonly<Record<string, unknown>> }>(
      "SELECT app.cleanup_api_runtime_records() result",
    );
    return result.rows[0]?.result ?? {};
  }
}
