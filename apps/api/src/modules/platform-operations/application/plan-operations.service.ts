import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";

interface PlanRow extends QueryResultRow {
  readonly key: string;
  readonly display_name: string;
  readonly active: boolean;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly tenant_count: number;
  readonly active_tenant_count: number;
}

export interface PlanOperationsView {
  readonly key: string;
  readonly displayName: string;
  readonly active: boolean;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly tenantCount: number;
  readonly activeTenantCount: number;
}

@Injectable()
export class PlanOperationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<readonly PlanOperationsView[]> {
    const result = await this.database.controlPlaneQuery<PlanRow>(
      `SELECT plan.key, plan.display_name, plan.active, plan.limits,
              count(tenant.id)::int AS tenant_count,
              count(tenant.id) FILTER (WHERE tenant.status = 'active')::int AS active_tenant_count
       FROM plans plan
       LEFT JOIN tenants tenant ON tenant.plan_key = plan.key
       GROUP BY plan.key, plan.display_name, plan.active, plan.limits
       ORDER BY plan.active DESC, plan.display_name`,
    );
    return result.rows.map((row) => ({
      key: row.key,
      displayName: row.display_name,
      active: row.active,
      limits: row.limits,
      tenantCount: Number(row.tenant_count),
      activeTenantCount: Number(row.active_tenant_count),
    }));
  }
}
