import { Injectable, NotFoundException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";

interface ReleaseRingRow extends QueryResultRow {
  readonly key: string;
  readonly display_name: string;
  readonly description: string;
  readonly sequence: number;
  readonly lifecycle: "active" | "retired";
  readonly version: number;
  readonly tenant_count: number;
  readonly configured_flag_count: number;
}

interface RingConfiguration {
  readonly enabled: boolean;
  readonly version: number;
}

interface FeatureFlagRow extends QueryResultRow {
  readonly key: string;
  readonly display_name: string;
  readonly description: string;
  readonly risk_level: "low" | "medium" | "high" | "critical";
  readonly lifecycle: "draft" | "active" | "retired";
  readonly default_enabled: boolean;
  readonly required_module_key: string | null;
  readonly version: number;
  readonly ring_configuration: Readonly<Record<string, RingConfiguration>>;
  readonly tenant_override_count: number;
}

interface TenantReleaseRow extends QueryResultRow {
  readonly id: string;
  readonly slug: string;
  readonly display_name: string;
  readonly status: string;
  readonly ring_key: string;
  readonly assignment_version: number;
  readonly overrides: readonly {
    readonly key: string;
    readonly enabled: boolean;
    readonly version: number;
  }[];
}

@Injectable()
export class ReleaseGovernanceService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    const [rings, flags] = await Promise.all([
      this.database.controlPlaneQuery<ReleaseRingRow>(
        `SELECT ring.key, ring.display_name, ring.description, ring.sequence, ring.lifecycle, ring.version,
                count(DISTINCT assignment.tenant_id)::int AS tenant_count,
                count(DISTINCT configuration.feature_flag_key)::int AS configured_flag_count
         FROM release_rings ring
         LEFT JOIN tenant_release_assignments assignment ON assignment.ring_key = ring.key
         LEFT JOIN release_ring_feature_flags configuration ON configuration.ring_key = ring.key
         GROUP BY ring.key,ring.display_name,ring.description,ring.sequence,
                  ring.lifecycle,ring.version
         ORDER BY ring.sequence`,
      ),
      this.database.controlPlaneQuery<FeatureFlagRow>(
        `SELECT flag.key, flag.display_name, flag.description, flag.risk_level, flag.lifecycle,
                flag.default_enabled, flag.required_module_key, flag.version,
                COALESCE(jsonb_object_agg(
                  configuration.ring_key,
                  jsonb_build_object('enabled', configuration.enabled, 'version', configuration.version)
                ) FILTER (WHERE configuration.ring_key IS NOT NULL), '{}'::jsonb) AS ring_configuration,
                count(DISTINCT tenant_override.tenant_id)::int AS tenant_override_count
         FROM feature_flags flag
         LEFT JOIN release_ring_feature_flags configuration ON configuration.feature_flag_key = flag.key
         LEFT JOIN tenant_feature_flag_overrides tenant_override ON tenant_override.feature_flag_key = flag.key
         GROUP BY flag.key
         ORDER BY flag.key`,
      ),
    ]);
    return {
      rings: rings.rows.map((row) => ({
        key: row.key,
        displayName: row.display_name,
        description: row.description,
        sequence: row.sequence,
        lifecycle: row.lifecycle,
        version: row.version,
        tenantCount: row.tenant_count,
        configuredFlagCount: row.configured_flag_count,
      })),
      flags: flags.rows.map((row) => ({
        key: row.key,
        displayName: row.display_name,
        description: row.description,
        riskLevel: row.risk_level,
        lifecycle: row.lifecycle,
        defaultEnabled: row.default_enabled,
        ...(row.required_module_key ? { requiredModuleKey: row.required_module_key } : {}),
        version: row.version,
        ringConfiguration: row.ring_configuration,
        tenantOverrideCount: row.tenant_override_count,
      })),
    };
  }

  async tenant(tenantId: string) {
    const result = await this.database.controlPlaneQuery<TenantReleaseRow>(
      `SELECT tenant.id, tenant.slug, tenant.display_name, tenant.status,
              COALESCE(assignment.ring_key, 'general-availability') AS ring_key,
              COALESCE(assignment.version, 0)::int AS assignment_version,
              COALESCE(jsonb_agg(jsonb_build_object(
                'key', override.feature_flag_key,
                'enabled', override.enabled,
                'version', override.version
              )) FILTER (WHERE override.feature_flag_key IS NOT NULL), '[]'::jsonb) AS overrides
       FROM tenants tenant
       LEFT JOIN tenant_release_assignments assignment ON assignment.tenant_id = tenant.id
       LEFT JOIN tenant_feature_flag_overrides override ON override.tenant_id = tenant.id
       WHERE tenant.id = $1
       GROUP BY tenant.id, assignment.ring_key, assignment.version`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Tenant was not found");
    return {
      tenant: { id: row.id, slug: row.slug, displayName: row.display_name, status: row.status },
      ringKey: row.ring_key,
      assignmentVersion: row.assignment_version,
      overrides: row.overrides,
    };
  }
}
