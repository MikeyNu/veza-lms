import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { MembershipId, TenantId, UserId } from "@veza/contracts";
import type { PoolClient } from "pg";

export interface AuditRecordInput {
  readonly tenantId: TenantId;
  readonly plane: "control" | "application";
  readonly eventType: string;
  readonly actorId: UserId;
  readonly membershipId?: MembershipId;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly purpose?: string;
  readonly correlationId: string;
  readonly beforeState?: Readonly<Record<string, unknown>>;
  readonly afterState?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

@Injectable()
export class AuditWriter {
  async append(client: PoolClient, input: AuditRecordInput): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, plane, event_type, actor_id, membership_id,
         resource_type, resource_id, purpose, correlation_id,
         before_state, after_state, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        input.tenantId,
        input.plane,
        input.eventType,
        input.actorId,
        input.membershipId ?? null,
        input.resourceType,
        input.resourceId,
        input.purpose ?? null,
        input.correlationId,
        input.beforeState ?? null,
        input.afterState ?? null,
        input.metadata ?? {},
      ],
    );
    return id;
  }
}
