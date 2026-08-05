import { ConflictException, Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal, TenantModuleKey } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { isPostgresError } from "../../../platform/database/database.types.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type { CreateFeatureFlagDto } from "./release-governance-mutations.dto.js";
import { canonicalHash, featureFlagKey, operationalReason, PlatformOperationExecutor } from "./release-governance-mutation-support.js";

interface FlagRow extends QueryResultRow {
  readonly key: string;
  readonly display_name: string;
  readonly risk_level: "low" | "medium" | "high" | "critical";
  readonly lifecycle: "draft";
  readonly default_enabled: boolean;
  readonly required_module_key: TenantModuleKey | null;
  readonly version: number;
}
export interface FeatureFlagMutationResponse { readonly key: string; readonly lifecycle: "draft" | "active" | "retired"; readonly version: number }

@Injectable()
export class CreateFeatureFlagService {
  constructor(private readonly operations: PlatformOperationExecutor, private readonly audit: PlatformAuditWriter) {}

  async execute(principal: AuthenticatedPrincipal, input: CreateFeatureFlagDto, idempotencyKey: string, correlationId: string): Promise<FeatureFlagMutationResponse> {
    const key = featureFlagKey(input.key);
    const reason = operationalReason(input.reason);
    return this.operations.run(
      principal, idempotencyKey, "feature-flag-create", "feature-flag", key,
      canonicalHash({ ...input, key, reason }),
      async (client) => {
        let row: FlagRow | undefined;
        try {
          row = (await client.query<FlagRow>(
            `INSERT INTO feature_flags (
               key, display_name, description, risk_level, lifecycle,
               default_enabled, required_module_key, created_by, updated_by
             ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$7)
             RETURNING key, display_name, risk_level, lifecycle,
                       default_enabled, required_module_key, version`,
            [key, input.displayName.trim(), input.description.trim(), input.riskLevel,
             input.defaultEnabled, input.requiredModuleKey ?? null, principal.userId],
          )).rows[0];
        } catch (error) {
          if (isPostgresError(error, "23505", "feature_flags_pkey")) throw new ConflictException("Feature flag key is already in use");
          throw error;
        }
        if (!row) throw new Error("Feature flag insert returned no row");
        await this.audit.append(client, {
          eventType: "platform.feature-flag-created", actorId: principal.userId,
          resourceType: "feature-flag", resourceId: row.key, correlationId,
          metadata: {
            displayName: row.display_name, riskLevel: row.risk_level, lifecycle: row.lifecycle,
            defaultEnabled: row.default_enabled, requiredModuleKey: row.required_module_key,
            version: row.version, reason,
          },
        });
        return { key: row.key, lifecycle: row.lifecycle, version: row.version };
      },
    );
  }
}
