import type { Pool, QueryResultRow } from "pg";

interface ReconciliationRow extends QueryResultRow {
  readonly result: {
    readonly globalSchedules?: unknown;
    readonly tenantSchedules?: unknown;
  } | null;
}

export class PlatformScheduleReconciler {
  constructor(private readonly pool: Pool) {}

  async reconcile(): Promise<{
    readonly globalSchedules: number;
    readonly tenantSchedules: number;
  }> {
    const response = await this.pool.query<ReconciliationRow>(
      "SELECT app.ensure_platform_schedules() result",
    );
    const result = response.rows[0]?.result;
    return {
      globalSchedules: Number(result?.globalSchedules ?? 0),
      tenantSchedules: Number(result?.tenantSchedules ?? 0),
    };
  }
}
