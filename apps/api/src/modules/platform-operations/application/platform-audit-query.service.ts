import { BadRequestException, Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type { ListPlatformAuditEventsDto } from "./list-platform-audit-events.dto.js";

interface PlatformAuditRow extends QueryResultRow {
  readonly id: string;
  readonly event_type: string;
  readonly actor_id: string;
  readonly actor_display_name: string | null;
  readonly actor_email: string | null;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly correlation_id: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurred_at: Date;
}

interface Cursor {
  readonly occurredAt: string;
  readonly id: string;
}

export interface PlatformAuditEventView {
  readonly id: string;
  readonly eventType: string;
  readonly actor: {
    readonly id: string;
    readonly displayName?: string;
    readonly email?: string;
  };
  readonly resource: { readonly type: string; readonly id: string };
  readonly correlationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface PlatformAuditPage {
  readonly items: readonly PlatformAuditEventView[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (!parsed.occurredAt || !Number.isFinite(Date.parse(parsed.occurredAt)) || !parsed.id || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error();
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Platform audit cursor is invalid");
  }
}

function map(row: PlatformAuditRow): PlatformAuditEventView {
  return {
    id: row.id,
    eventType: row.event_type,
    actor: {
      id: row.actor_id,
      ...(row.actor_display_name ? { displayName: row.actor_display_name } : {}),
      ...(row.actor_email ? { email: row.actor_email } : {}),
    },
    resource: { type: row.resource_type, id: row.resource_id },
    correlationId: row.correlation_id,
    metadata: row.metadata,
    occurredAt: row.occurred_at.toISOString(),
  };
}

@Injectable()
export class PlatformAuditQueryService {
  constructor(private readonly database: DatabaseService) {}

  async list(input: ListPlatformAuditEventsDto): Promise<PlatformAuditPage> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };
    if (input.eventType) conditions.push(`event.event_type = ${bind(input.eventType)}`);
    if (input.actorId) conditions.push(`event.actor_id = ${bind(input.actorId)}::uuid`);
    if (input.resourceType) conditions.push(`event.resource_type = ${bind(input.resourceType)}`);
    if (input.resourceId) conditions.push(`event.resource_id = ${bind(input.resourceId)}`);
    if (input.from) conditions.push(`event.occurred_at >= ${bind(input.from)}::timestamptz`);
    if (input.to) conditions.push(`event.occurred_at < ${bind(input.to)}::timestamptz`);
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    if (cursor) {
      const occurredAt = bind(cursor.occurredAt);
      const id = bind(cursor.id);
      conditions.push(`(event.occurred_at, event.id) < (${occurredAt}::timestamptz, ${id}::uuid)`);
    }
    const limit = bind(input.limit + 1);
    const result = await this.database.controlPlaneQuery<PlatformAuditRow>(
      `SELECT event.id, event.event_type, event.actor_id,
              actor.display_name AS actor_display_name,
              actor.email::text AS actor_email,
              event.resource_type, event.resource_id, event.correlation_id,
              event.metadata, event.occurred_at
       FROM platform_audit_events event
       LEFT JOIN users actor ON actor.id = event.actor_id
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY event.occurred_at DESC, event.id DESC
       LIMIT ${limit}`,
      values,
    );
    const hasMore = result.rows.length > input.limit;
    const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
    const last = rows.at(-1);
    return {
      items: rows.map(map),
      page: {
        limit: input.limit,
        ...(hasMore && last ? { nextCursor: encodeCursor({ occurredAt: last.occurred_at.toISOString(), id: last.id }) } : {}),
      },
    };
  }
}
