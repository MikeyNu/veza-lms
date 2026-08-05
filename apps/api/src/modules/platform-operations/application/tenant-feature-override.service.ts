import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal, TenantId, TenantModuleKey, UserId } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type { ConfigureTenantFlagDto } from "./release-governance-mutations.dto.js";
import { canonicalHash, featureFlagKey, operationalReason, PlatformOperationExecutor, requireVersion } from "./release-governance-mutation-support.js";

interface TenantRow extends QueryResultRow { readonly id: string; readonly status: "provisioning" | "active" | "suspended" | "offboarding" | "closed" }
interface FlagRow extends QueryResultRow { readonly lifecycle: "draft" | "active" | "retired"; readonly required_module_key: TenantModuleKey | null }
interface OverrideRow extends QueryResultRow { readonly enabled: boolean; readonly version: number }
interface EntitlementRow extends QueryResultRow { readonly available: boolean }
export interface TenantFlagMutationResponse { readonly tenantId: string; readonly featureFlagKey: string; readonly state: "enabled" | "disabled" | "inherit"; readonly version: number }

@Injectable()
export class TenantFeatureOverrideService {
  constructor(private readonly operations: PlatformOperationExecutor, private readonly platformAudit: PlatformAuditWriter, private readonly tenantAudit: AuditWriter) {}

  async execute(principal: AuthenticatedPrincipal, tenantId: string, flagValue: string, input: ConfigureTenantFlagDto, idempotencyKey: string, correlationId: string): Promise<TenantFlagMutationResponse> {
    const flagKey = featureFlagKey(flagValue);
    const reason = operationalReason(input.reason);
    return this.operations.run(
      principal, idempotencyKey, "tenant-feature-flag-configure", "tenant-feature-flag", `${tenantId}:${flagKey}`,
      canonicalHash({ tenantId, flagKey, state: input.state, expectedVersion: input.expectedVersion, reason }),
      async (client) => {
        const tenant = (await client.query<TenantRow>(`SELECT id, status FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId])).rows[0];
        if (!tenant) throw new NotFoundException("Tenant was not found");
        if (tenant.status === "offboarding" || tenant.status === "closed") throw new ConflictException("Release configuration cannot change for an offboarding or closed tenant");
        const flag = (await client.query<FlagRow>(`SELECT lifecycle, required_module_key FROM feature_flags WHERE key = $1 FOR UPDATE`, [flagKey])).rows[0];
        if (!flag) throw new NotFoundException("Feature flag was not found");
        if (flag.lifecycle !== "active") throw new ConflictException("Only active feature flags can receive tenant overrides");
        if (input.state === "enabled" && flag.required_module_key) {
          const available = (await client.query<EntitlementRow>(
            `SELECT EXISTS (
               SELECT 1 FROM tenant_entitlements
               WHERE tenant_id = $1 AND module_key = $2 AND state IN ('enabled','trial')
                 AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())
             ) AS available`, [tenantId, flag.required_module_key],
          )).rows[0]?.available;
          if (!available) throw new ConflictException(`Feature flag requires the ${flag.required_module_key} entitlement`);
        }
        const current = (await client.query<OverrideRow>(
          `SELECT enabled, version FROM tenant_feature_flag_overrides
           WHERE tenant_id = $1 AND feature_flag_key = $2 FOR UPDATE`, [tenantId, flagKey],
        )).rows[0];
        requireVersion(input.expectedVersion, current?.version ?? 0, "Tenant feature override");
        let version = 0;
        if (input.state === "inherit") {
          if (current) {
            const removed = await client.query(
              `DELETE FROM tenant_feature_flag_overrides
               WHERE tenant_id = $1 AND feature_flag_key = $2 AND version = $3`,
              [tenantId, flagKey, input.expectedVersion],
            );
            if (removed.rowCount !== 1) throw new ConflictException("Tenant feature override changed before removal completed");
          }
        } else {
          const enabled = input.state === "enabled";
          const row = (current
            ? await client.query<OverrideRow>(
                `UPDATE tenant_feature_flag_overrides
                 SET enabled = $3, reason = $4, version = version + 1, configured_by = $5, updated_at = now()
                 WHERE tenant_id = $1 AND feature_flag_key = $2 AND version = $6 RETURNING enabled, version`,
                [tenantId, flagKey, enabled, reason, principal.userId, input.expectedVersion],
              )
            : await client.query<OverrideRow>(
                `INSERT INTO tenant_feature_flag_overrides (tenant_id, feature_flag_key, enabled, reason, configured_by)
                 VALUES ($1,$2,$3,$4,$5) RETURNING enabled, version`,
                [tenantId, flagKey, enabled, reason, principal.userId],
              )).rows[0];
          if (!row) throw new ConflictException("Tenant feature override changed before update completed");
          version = row.version;
        }
        const previousState = current ? (current.enabled ? "enabled" : "disabled") : "inherit";
        await this.tenantAudit.append(client, {
          tenantId: tenant.id as TenantId, plane: "control", eventType: "tenant.feature-flag-configured",
          actorId: principal.userId as UserId, resourceType: "feature-flag", resourceId: flagKey,
          purpose: reason, correlationId,
          beforeState: { state: previousState, version: current?.version ?? 0 },
          afterState: { state: input.state, version },
        });
        await this.platformAudit.append(client, {
          eventType: "platform.tenant-feature-flag-configured", actorId: principal.userId,
          resourceType: "tenant-feature-flag", resourceId: `${tenant.id}:${flagKey}`, correlationId,
          metadata: {
            tenantId: tenant.id, tenantStatus: tenant.status, featureFlagKey: flagKey,
            previousState, state: input.state, previousVersion: current?.version ?? 0,
            version, reason,
          },
        });
        return { tenantId: tenant.id, featureFlagKey: flagKey, state: input.state, version };
      },
    );
  }
}
