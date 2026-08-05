import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type { ConfigureRingFlagDto } from "./release-governance-mutations.dto.js";
import { canonicalHash, featureFlagKey, operationalReason, PlatformOperationExecutor, releaseRingKey, requireVersion } from "./release-governance-mutation-support.js";

interface RingRow extends QueryResultRow { readonly lifecycle: "active" | "retired" }
interface FlagRow extends QueryResultRow { readonly lifecycle: "draft" | "active" | "retired" }
interface ConfigurationRow extends QueryResultRow { readonly enabled: boolean; readonly version: number }
export interface RingFlagMutationResponse { readonly ringKey: string; readonly featureFlagKey: string; readonly enabled: boolean; readonly version: number }

@Injectable()
export class RingFeatureConfigurationService {
  constructor(private readonly operations: PlatformOperationExecutor, private readonly audit: PlatformAuditWriter) {}

  async execute(principal: AuthenticatedPrincipal, ringValue: string, flagValue: string, input: ConfigureRingFlagDto, idempotencyKey: string, correlationId: string): Promise<RingFlagMutationResponse> {
    const ringKey = releaseRingKey(ringValue);
    const flagKey = featureFlagKey(flagValue);
    const reason = operationalReason(input.reason);
    return this.operations.run(
      principal, idempotencyKey, "release-ring-feature-configure", "release-ring-feature", `${ringKey}:${flagKey}`,
      canonicalHash({ ringKey, flagKey, enabled: input.enabled, expectedVersion: input.expectedVersion, reason }),
      async (client) => {
        const ring = (await client.query<RingRow>(`SELECT lifecycle FROM release_rings WHERE key = $1 FOR UPDATE`, [ringKey])).rows[0];
        if (!ring) throw new NotFoundException("Release ring was not found");
        if (ring.lifecycle !== "active") throw new ConflictException("Release ring is retired");
        const flag = (await client.query<FlagRow>(`SELECT lifecycle FROM feature_flags WHERE key = $1 FOR UPDATE`, [flagKey])).rows[0];
        if (!flag) throw new NotFoundException("Feature flag was not found");
        if (flag.lifecycle !== "active") throw new ConflictException("Only active feature flags can be configured for release rings");
        const current = (await client.query<ConfigurationRow>(
          `SELECT enabled, version FROM release_ring_feature_flags
           WHERE ring_key = $1 AND feature_flag_key = $2 FOR UPDATE`, [ringKey, flagKey],
        )).rows[0];
        requireVersion(input.expectedVersion, current?.version ?? 0, "Release-ring configuration");
        const row = (current
          ? await client.query<ConfigurationRow>(
              `UPDATE release_ring_feature_flags
               SET enabled = $3, reason = $4, version = version + 1, configured_by = $5, updated_at = now()
               WHERE ring_key = $1 AND feature_flag_key = $2 AND version = $6 RETURNING enabled, version`,
              [ringKey, flagKey, input.enabled, reason, principal.userId, input.expectedVersion],
            )
          : await client.query<ConfigurationRow>(
              `INSERT INTO release_ring_feature_flags (ring_key, feature_flag_key, enabled, reason, configured_by)
               VALUES ($1,$2,$3,$4,$5) RETURNING enabled, version`,
              [ringKey, flagKey, input.enabled, reason, principal.userId],
            )).rows[0];
        if (!row) throw new ConflictException("Release-ring configuration changed before update completed");
        await this.audit.append(client, {
          eventType: "platform.release-ring-feature-configured", actorId: principal.userId,
          resourceType: "release-ring-feature", resourceId: `${ringKey}:${flagKey}`, correlationId,
          metadata: {
            ringKey, featureFlagKey: flagKey, beforeEnabled: current?.enabled ?? null,
            enabled: row.enabled, previousVersion: current?.version ?? 0, version: row.version, reason,
          },
        });
        return { ringKey, featureFlagKey: flagKey, enabled: row.enabled, version: row.version };
      },
    );
  }
}
