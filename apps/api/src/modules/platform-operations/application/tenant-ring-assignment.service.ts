import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal, TenantId, UserId } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type { AssignTenantReleaseRingDto } from "./release-governance-mutations.dto.js";
import { canonicalHash, operationalReason, PlatformOperationExecutor, releaseRingKey, requireVersion } from "./release-governance-mutation-support.js";

interface TenantRow extends QueryResultRow { readonly id: string; readonly status: "provisioning" | "active" | "suspended" | "offboarding" | "closed" }
interface RingRow extends QueryResultRow { readonly lifecycle: "active" | "retired" }
interface AssignmentRow extends QueryResultRow {
  readonly ring_key: string;
  readonly version: number;
  readonly is_canary: boolean;
  readonly effective_from: Date;
  readonly effective_until: Date | null;
}
export interface TenantRingMutationResponse {
  readonly tenantId: string;
  readonly ringKey: string;
  readonly isCanary: boolean;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly version: number;
}

@Injectable()
export class TenantRingAssignmentService {
  constructor(private readonly operations: PlatformOperationExecutor, private readonly platformAudit: PlatformAuditWriter, private readonly tenantAudit: AuditWriter) {}

  async execute(principal: AuthenticatedPrincipal, tenantId: string, input: AssignTenantReleaseRingDto, idempotencyKey: string, correlationId: string): Promise<TenantRingMutationResponse> {
    const ringKey = releaseRingKey(input.ringKey);
    const reason = operationalReason(input.reason);
    if (input.effectiveUntil && new Date(input.effectiveUntil) <= new Date(input.effectiveFrom)) {
      throw new BadRequestException("Release ring assignment end must be after its start");
    }
    return this.operations.run(
      principal, idempotencyKey, "tenant-release-ring-assign", "tenant-release-assignment", tenantId,
      canonicalHash({ tenantId, ringKey, isCanary: input.isCanary, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil ?? null, expectedVersion: input.expectedVersion, reason }),
      async (client) => {
        const tenant = (await client.query<TenantRow>(`SELECT id, status FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId])).rows[0];
        if (!tenant) throw new NotFoundException("Tenant was not found");
        if (tenant.status === "offboarding" || tenant.status === "closed") throw new ConflictException("Release configuration cannot change for an offboarding or closed tenant");
        const ring = (await client.query<RingRow>(`SELECT lifecycle FROM release_rings WHERE key = $1 FOR UPDATE`, [ringKey])).rows[0];
        if (!ring) throw new NotFoundException("Release ring was not found");
        if (ring.lifecycle !== "active") throw new ConflictException("Release ring is retired");
        const current = (await client.query<AssignmentRow>(
          `SELECT ring_key, version, is_canary, effective_from, effective_until
           FROM tenant_release_assignments WHERE tenant_id = $1 FOR UPDATE`,
          [tenantId],
        )).rows[0];
        requireVersion(input.expectedVersion, current?.version ?? 0, "Tenant release assignment");
        const row = (current
          ? await client.query<AssignmentRow>(
              `UPDATE tenant_release_assignments
               SET ring_key = $2, reason = $3, is_canary = $4,
                   effective_from = $5, effective_until = $6,
                   version = version + 1, assigned_by = $7,
                   assigned_at = now(), updated_at = now()
               WHERE tenant_id = $1 AND version = $8
               RETURNING ring_key, version, is_canary, effective_from, effective_until`,
              [tenantId, ringKey, reason, input.isCanary, input.effectiveFrom,
                input.effectiveUntil ?? null, principal.userId, input.expectedVersion],
            )
          : await client.query<AssignmentRow>(
              `INSERT INTO tenant_release_assignments (
                 tenant_id, ring_key, reason, is_canary,
                 effective_from, effective_until, assigned_by
               ) VALUES ($1,$2,$3,$4,$5,$6,$7)
               RETURNING ring_key, version, is_canary, effective_from, effective_until`,
              [tenantId, ringKey, reason, input.isCanary, input.effectiveFrom,
                input.effectiveUntil ?? null, principal.userId],
            )).rows[0];
        if (!row) throw new ConflictException("Tenant release assignment changed before update completed");
        await this.tenantAudit.append(client, {
          tenantId: tenant.id as TenantId, plane: "control", eventType: "tenant.release-ring-assigned",
          actorId: principal.userId as UserId, resourceType: "tenant", resourceId: tenant.id,
          purpose: reason, correlationId,
          beforeState: {
            ringKey: current?.ring_key ?? "general-availability",
            isCanary: current?.is_canary ?? false,
            effectiveFrom: current?.effective_from?.toISOString() ?? null,
            effectiveUntil: current?.effective_until?.toISOString() ?? null,
            version: current?.version ?? 0,
          },
          afterState: {
            ringKey: row.ring_key,
            isCanary: row.is_canary,
            effectiveFrom: row.effective_from.toISOString(),
            effectiveUntil: row.effective_until?.toISOString() ?? null,
            version: row.version,
          },
        });
        await this.platformAudit.append(client, {
          eventType: "platform.tenant-release-ring-assigned", actorId: principal.userId,
          resourceType: "tenant", resourceId: tenant.id, correlationId,
          metadata: {
            tenantStatus: tenant.status, beforeRingKey: current?.ring_key ?? "general-availability",
            ringKey: row.ring_key, isCanary: row.is_canary,
            effectiveFrom: row.effective_from.toISOString(),
            effectiveUntil: row.effective_until?.toISOString() ?? null,
            previousVersion: current?.version ?? 0, version: row.version, reason,
          },
        });
        return {
          tenantId: tenant.id,
          ringKey: row.ring_key,
          isCanary: row.is_canary,
          effectiveFrom: row.effective_from.toISOString(),
          ...(row.effective_until ? { effectiveUntil: row.effective_until.toISOString() } : {}),
          version: row.version,
        };
      },
    );
  }
}
