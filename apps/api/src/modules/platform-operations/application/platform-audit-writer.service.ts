import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

export interface PlatformAuditInput {
  readonly eventType: string;
  readonly actorId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly correlationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

@Injectable()
export class PlatformAuditWriter {
  async append(client: PoolClient, input: PlatformAuditInput): Promise<void> {
    await client.query(
      `INSERT INTO platform_audit_events (
         event_type, actor_id, resource_type, resource_id, correlation_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        input.eventType,
        input.actorId,
        input.resourceType,
        input.resourceId,
        input.correlationId,
        input.metadata ?? {},
      ],
    );
  }
}
