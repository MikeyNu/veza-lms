import type { Pool, QueryResultRow } from "pg";

interface RefreshRow extends QueryResultRow {
  refreshed: number;
}

export class CoreMetricRefresher {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
    private readonly batchSize: number,
  ) {}

  async refreshDue(): Promise<number> {
    const result = await this.pool.query<RefreshRow>(
      "SELECT app.refresh_due_core_metrics($1,$2) refreshed",
      [this.workerId, this.batchSize],
    );
    return Number(result.rows[0]?.refreshed ?? 0);
  }
}
