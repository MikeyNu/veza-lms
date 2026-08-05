import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type { ChangeFeatureFlagLifecycleDto } from "./release-governance-mutations.dto.js";
import { canonicalHash, featureFlagKey, operationalReason, PlatformOperationExecutor, requireVersion } from "./release-governance-mutation-support.js";
import type { FeatureFlagMutationResponse } from "./create-feature-flag.service.js";

interface FlagRow extends QueryResultRow { readonly key: string; readonly lifecycle: "draft" | "active" | "retired"; readonly version: number }

@Injectable()
export class FeatureFlagLifecycleService {
  constructor(private readonly operations: PlatformOperationExecutor, private readonly audit: PlatformAuditWriter) {}

  async execute(principal: AuthenticatedPrincipal, flagKeyValue: string, input: ChangeFeatureFlagLifecycleDto, idempotencyKey: string, correlationId: string): Promise<FeatureFlagMutationResponse> {
    const key = featureFlagKey(flagKeyValue);
    const reason = operationalReason(input.reason);
    return this.operations.run(
      principal, idempotencyKey, "feature-flag-lifecycle-change", "feature-flag", key,
      canonicalHash({ key, lifecycle: input.lifecycle, expectedVersion: input.expectedVersion, reason }),
      async (client) => {
        const existing = (await client.query<FlagRow>(
          `SELECT key, lifecycle, version FROM feature_flags WHERE key = $1 FOR UPDATE`, [key],
        )).rows[0];
        if (!existing) throw new NotFoundException("Feature flag was not found");
        requireVersion(input.expectedVersion, existing.version, "Feature flag");
        if (existing.lifecycle === "retired") throw new ConflictException("Retired feature flags cannot be reactivated");
        if (existing.lifecycle === input.lifecycle) throw new ConflictException("Feature flag is already in the requested lifecycle");
        const row = (await client.query<FlagRow>(
          `UPDATE feature_flags
           SET lifecycle = $2, version = version + 1, updated_by = $3, updated_at = now()
           WHERE key = $1 AND version = $4 RETURNING key, lifecycle, version`,
          [key, input.lifecycle, principal.userId, input.expectedVersion],
        )).rows[0];
        if (!row) throw new ConflictException("Feature flag changed before lifecycle update completed");
        await this.audit.append(client, {
          eventType: "platform.feature-flag-lifecycle-changed", actorId: principal.userId,
          resourceType: "feature-flag", resourceId: key, correlationId,
          metadata: {
            beforeLifecycle: existing.lifecycle, afterLifecycle: row.lifecycle,
            previousVersion: existing.version, version: row.version, reason,
          },
        });
        return { key, lifecycle: row.lifecycle, version: row.version };
      },
    );
  }
}
