import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";

interface FeatureFlagRow extends QueryResultRow {
  readonly flag_key: string;
  readonly enabled: boolean;
  readonly source: "tenant-override" | "release-ring" | "default" | "entitlement";
  readonly ring_key: string;
  readonly configuration_version: number;
  readonly required_module_key: string | null;
}

export interface EvaluatedFeatureFlag {
  readonly key: string;
  readonly enabled: boolean;
  readonly source: FeatureFlagRow["source"];
  readonly ringKey: string;
  readonly configurationVersion: number;
  readonly requiredModuleKey?: string;
}

@Injectable()
export class FeatureFlagService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(): Promise<readonly EvaluatedFeatureFlag[]> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<FeatureFlagRow>(
        `SELECT flag_key, enabled, source, ring_key, configuration_version, required_module_key
         FROM app.current_feature_flags()`,
      );
      return result.rows.map((row) => ({
        key: row.flag_key,
        enabled: row.enabled,
        source: row.source,
        ringKey: row.ring_key,
        configurationVersion: row.configuration_version,
        ...(row.required_module_key ? { requiredModuleKey: row.required_module_key } : {}),
      }));
    });
  }

  async isEnabled(key: string): Promise<boolean> {
    return (await this.list()).some((flag) => flag.key === key && flag.enabled);
  }
}
