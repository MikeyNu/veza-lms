import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TenantId, UserId } from "@veza/contracts";
import type { PoolClient } from "pg";

export interface OutboxEventInput {
  readonly tenantId: TenantId;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly actorId: UserId;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

@Injectable()
export class OutboxWriter {
  async append(client: PoolClient, input: OutboxEventInput): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO outbox_events (
         id, tenant_id, event_name, event_version, aggregate_type,
         aggregate_id, aggregate_version, actor_id, correlation_id, payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        input.tenantId,
        input.eventName,
        input.eventVersion,
        input.aggregateType,
        input.aggregateId,
        input.aggregateVersion,
        input.actorId,
        input.correlationId,
        input.payload,
      ],
    );
    return id;
  }
}
