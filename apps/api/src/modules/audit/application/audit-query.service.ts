import { BadRequestException, Injectable } from "@nestjs/common";
import type { MembershipId, TenantId, UserId } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { ListAuditEventsDto } from "./list-audit-events.dto.js";

interface AuditEventRow extends QueryResultRow {
  readonly id: string;
  readonly plane: "control" | "application";
  readonly event_type: string;
  readonly actor_id: string;
  readonly membership_id: string | null;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly purpose: string | null;
  readonly correlation_id: string;
  readonly before_state: Readonly<Record<string, unknown>> | null;
  readonly after_state: Readonly<Record<string, unknown>> | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurred_at: Date;
}

interface AuditCursor {
  readonly occurredAt: string;
  readonly id: string;
}

export interface AuditEventView {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly plane: "control" | "application";
  readonly eventType: string;
  readonly actorId: UserId;
  readonly membershipId?: MembershipId;
  readonly resource: {
    readonly type: string;
    readonly id: string;
  };
  readonly purpose?: string;
  readonly correlationId: string;
  readonly changes: {
    readonly before?: Readonly<Record<string, unknown>>;
    readonly after?: Readonly<Record<string, unknown>>;
  };
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface AuditEventPage {
  readonly items: readonly AuditEventView[];
  readonly page: {
    readonly limit: number;
    readonly nextCursor?: string;
  };
}

function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): AuditCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AuditCursor>;
    if (!parsed.occurredAt || !parsed.id || !Number.isFinite(Date.parse(parsed.occurredAt))) throw new Error();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) {
      throw new Error();
    }
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Audit cursor is invalid");
  }
}

function optionalProperty<TKey extends string, TValue>(key: TKey, value: TValue | null): Record<TKey, TValue> | {} {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>);
}

@Injectable()
export class AuditQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(input: ListAuditEventsDto): Promise<AuditEventPage> {
    const context = this.tenantContext.require();
    if (input.from && input.to && Date.parse(input.from) >= Date.parse(input.to)) {
      throw new BadRequestException("Audit date range must end after it starts");
    }

    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    const values: unknown[] = [];
    const conditions: string[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (input.eventType) conditions.push(`event_type = ${bind(input.eventType)}`);
    if (input.resourceType) conditions.push(`resource_type = ${bind(input.resourceType)}`);
    if (input.resourceId) conditions.push(`resource_id = ${bind(input.resourceId)}`);
    if (input.actorId) conditions.push(`actor_id = ${bind(input.actorId)}::uuid`);
    if (input.from) conditions.push(`occurred_at >= ${bind(input.from)}::timestamptz`);
    if (input.to) conditions.push(`occurred_at < ${bind(input.to)}::timestamptz`);
    if (cursor) {
      const occurredAtParameter = bind(cursor.occurredAt);
      const idParameter = bind(cursor.id);
      conditions.push(`(occurred_at, id) < (${occurredAtParameter}::timestamptz, ${idParameter}::uuid)`);
    }

    const fetchLimit = input.limit + 1;
    const limitParameter = bind(fetchLimit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<AuditEventRow>(
        `SELECT id, plane, event_type, actor_id, membership_id,
                resource_type, resource_id, purpose, correlation_id,
                before_state, after_state, metadata, occurred_at
         FROM audit_events
         ${where}
         ORDER BY occurred_at DESC, id DESC
         LIMIT ${limitParameter}`,
        values,
      );

      const hasMore = result.rows.length > input.limit;
      const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
      const last = rows.at(-1);
      const nextCursor = hasMore && last
        ? encodeCursor({ occurredAt: last.occurred_at.toISOString(), id: last.id })
        : undefined;

      return {
        items: rows.map((row) => ({
          id: row.id,
          tenantId: context.tenantId,
          plane: row.plane,
          eventType: row.event_type,
          actorId: row.actor_id as UserId,
          ...optionalProperty("membershipId", row.membership_id as MembershipId | null),
          resource: { type: row.resource_type, id: row.resource_id },
          ...optionalProperty("purpose", row.purpose),
          correlationId: row.correlation_id,
          changes: {
            ...optionalProperty("before", row.before_state),
            ...optionalProperty("after", row.after_state),
          },
          metadata: row.metadata,
          occurredAt: row.occurred_at.toISOString(),
        })),
        page: {
          limit: input.limit,
          ...(nextCursor ? { nextCursor } : {}),
        },
      };
    });
  }
}
