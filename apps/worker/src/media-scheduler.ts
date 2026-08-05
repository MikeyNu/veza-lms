import type { Pool } from "pg";
import type { ScheduledJobHandler } from "./scheduler.js";

export class MediaRetentionReconciliationHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(
    payload: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    const requested = Number(payload.batchSize ?? 100);
    const batchSize = Number.isInteger(requested)
      ? Math.max(1, Math.min(500, requested))
      : 100;
    const result = await this.pool.query<{ prepared: number }>(
      "SELECT app.prepare_media_retention_deletions($1) prepared",
      [batchSize],
    );
    return { prepared: Number(result.rows[0]?.prepared ?? 0), batchSize };
  }
}
