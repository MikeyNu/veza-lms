import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DeploymentTier, TenantId, TenantModuleKey, TenantStatus } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type { ListTenantsDto } from "./list-tenants.dto.js";

interface TenantRow extends QueryResultRow {
  readonly id: string;
  readonly slug: string;
  readonly display_name: string;
  readonly legal_name: string;
  readonly status: TenantStatus;
  readonly deployment_tier: DeploymentTier;
  readonly residency_region: string;
  readonly plan_key: string;
  readonly locale: string;
  readonly timezone: string;
  readonly created_at: Date;
  readonly active_memberships: number;
  readonly pending_invitations: number;
  readonly pending_events: number;
  readonly modules: TenantModuleKey[];
}

interface TenantCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface ControlPlaneTenantView {
  readonly id: TenantId;
  readonly slug: string;
  readonly displayName: string;
  readonly legalName: string;
  readonly status: TenantStatus;
  readonly deploymentTier: DeploymentTier;
  readonly residencyRegion: string;
  readonly planKey: string;
  readonly locale: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly activeMemberships: number;
  readonly pendingInvitations: number;
  readonly pendingEvents: number;
  readonly modules: readonly TenantModuleKey[];
}

export interface ControlPlaneTenantPage {
  readonly items: readonly ControlPlaneTenantView[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

function encodeCursor(cursor: TenantCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): TenantCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TenantCursor>;
    if (!parsed.createdAt || !parsed.id || !Number.isFinite(Date.parse(parsed.createdAt))) throw new Error();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) throw new Error();
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Tenant cursor is invalid");
  }
}

function mapTenant(row: TenantRow): ControlPlaneTenantView {
  return {
    id: row.id as TenantId,
    slug: row.slug,
    displayName: row.display_name,
    legalName: row.legal_name,
    status: row.status,
    deploymentTier: row.deployment_tier,
    residencyRegion: row.residency_region,
    planKey: row.plan_key,
    locale: row.locale,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
    activeMemberships: Number(row.active_memberships),
    pendingInvitations: Number(row.pending_invitations),
    pendingEvents: Number(row.pending_events),
    modules: row.modules ?? [],
  };
}

const selectTenant = `
  SELECT t.id, t.slug::text, t.display_name, t.legal_name, t.status,
         t.deployment_tier, t.residency_region, t.plan_key, t.locale, t.timezone,
         t.created_at,
         (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = t.id AND m.status = 'active') AS active_memberships,
         (SELECT count(*)::int FROM membership_invitations i WHERE i.tenant_id = t.id AND i.status IN ('pending-delivery','sent')) AS pending_invitations,
         (SELECT count(*)::int FROM outbox_events o WHERE o.tenant_id = t.id AND o.published_at IS NULL) AS pending_events,
         COALESCE((SELECT array_agg(e.module_key ORDER BY e.module_key)
                   FROM tenant_entitlements e
                   WHERE e.tenant_id = t.id AND e.state <> 'disabled'), ARRAY[]::text[]) AS modules
  FROM tenants t`;

@Injectable()
export class TenantOperationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListTenantsDto): Promise<ControlPlaneTenantPage> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (input.query) {
      const parameter = bind(`%${input.query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
      conditions.push(`(t.display_name ILIKE ${parameter} ESCAPE '\\' OR t.slug::text ILIKE ${parameter} ESCAPE '\\' OR t.legal_name ILIKE ${parameter} ESCAPE '\\')`);
    }
    if (input.status) conditions.push(`t.status = ${bind(input.status)}`);
    if (input.planKey) conditions.push(`t.plan_key = ${bind(input.planKey)}`);
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    if (cursor) {
      const createdAt = bind(cursor.createdAt);
      const id = bind(cursor.id);
      conditions.push(`(t.created_at, t.id) < (${createdAt}::timestamptz, ${id}::uuid)`);
    }
    const limit = bind(input.limit + 1);
    const result = await this.database.controlPlaneQuery<TenantRow>(
      `${selectTenant}
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ${limit}`,
      values,
    );
    const hasMore = result.rows.length > input.limit;
    const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
    const last = rows.at(-1);
    return {
      items: rows.map(mapTenant),
      page: {
        limit: input.limit,
        ...(hasMore && last ? { nextCursor: encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id }) } : {}),
      },
    };
  }

  async detail(tenantId: TenantId): Promise<ControlPlaneTenantView> {
    const result = await this.database.controlPlaneQuery<TenantRow>(`${selectTenant} WHERE t.id = $1`, [tenantId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Tenant was not found");
    return mapTenant(row);
  }
}
