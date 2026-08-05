import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal, TenantId, UserId } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type { ListDeadLetterEventsDto } from "./list-dead-letter-events.dto.js";

interface DeadLetterRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_name: string;
  readonly event_version: number;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly aggregate_version: number;
  readonly attempts: number;
  readonly last_error: string | null;
  readonly occurred_at: Date;
  readonly dead_lettered_at: Date;
}

interface OperationRequestRow extends QueryResultRow {
  readonly operation_type: string;
  readonly request_hash: string;
  readonly status: "processing" | "completed" | "failed";
  readonly resource_type: string;
  readonly resource_id: string;
  readonly response: RequeueDeadLetterResponse | null;
}

interface Cursor { readonly deadLetteredAt: string; readonly id: string }

export interface DeadLetterEventView {
  readonly id: string;
  readonly tenantId: string;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly aggregate: { readonly type: string; readonly id: string; readonly version: number };
  readonly attempts: number;
  readonly failureCode: string;
  readonly occurredAt: string;
  readonly deadLetteredAt: string;
}

export interface DeadLetterPage {
  readonly items: readonly DeadLetterEventView[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

export interface RequeueDeadLetterResponse {
  readonly eventId: string;
  readonly state: "queued";
  readonly queuedAt: string;
  readonly previousAttempts: number;
}

function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (!parsed.deadLetteredAt || !Number.isFinite(Date.parse(parsed.deadLetteredAt)) || !parsed.id || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(parsed.id)) throw new Error();
    return { deadLetteredAt: parsed.deadLetteredAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Dead-letter cursor is invalid");
  }
}

function failureCode(error: string | null): string {
  return error?.match(/^([A-Za-z0-9._-]{2,80})(?=:)/)?.[1] ?? "delivery-failure";
}

@Injectable()
export class DeadLetterOperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantAudit: AuditWriter,
    private readonly platformAudit: PlatformAuditWriter,
  ) {}

  async list(input: ListDeadLetterEventsDto): Promise<DeadLetterPage> {
    if (input.from && input.to && Date.parse(input.from) >= Date.parse(input.to)) {
      throw new BadRequestException("Dead-letter date range must end after it starts");
    }
    const values: unknown[] = [];
    const conditions = ["dead_lettered_at IS NOT NULL", "published_at IS NULL"];
    const bind = (value: unknown): string => { values.push(value); return `$${values.length}`; };
    if (input.tenantId) conditions.push(`tenant_id = ${bind(input.tenantId)}::uuid`);
    if (input.eventName) conditions.push(`event_name = ${bind(input.eventName)}`);
    if (input.aggregateType) conditions.push(`aggregate_type = ${bind(input.aggregateType)}`);
    if (input.from) conditions.push(`dead_lettered_at >= ${bind(input.from)}::timestamptz`);
    if (input.to) conditions.push(`dead_lettered_at < ${bind(input.to)}::timestamptz`);
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    if (cursor) {
      const time = bind(cursor.deadLetteredAt);
      const id = bind(cursor.id);
      conditions.push(`(dead_lettered_at, id) < (${time}::timestamptz, ${id}::uuid)`);
    }
    const limit = bind(input.limit + 1);
    const result = await this.database.controlPlaneQuery<DeadLetterRow>(
      `SELECT id, tenant_id, event_name, event_version, aggregate_type, aggregate_id,
              aggregate_version, attempts, last_error, occurred_at, dead_lettered_at
       FROM outbox_events
       WHERE ${conditions.join(" AND ")}
       ORDER BY dead_lettered_at DESC, id DESC
       LIMIT ${limit}`,
      values,
    );
    const hasMore = result.rows.length > input.limit;
    const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
    const last = rows.at(-1);
    return {
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        eventName: row.event_name,
        eventVersion: row.event_version,
        aggregate: { type: row.aggregate_type, id: row.aggregate_id, version: row.aggregate_version },
        attempts: row.attempts,
        failureCode: failureCode(row.last_error),
        occurredAt: row.occurred_at.toISOString(),
        deadLetteredAt: row.dead_lettered_at.toISOString(),
      })),
      page: { limit: input.limit, ...(hasMore && last ? { nextCursor: encodeCursor({ deadLetteredAt: last.dead_lettered_at.toISOString(), id: last.id }) } : {}) },
    };
  }

  async requeue(
    principal: AuthenticatedPrincipal,
    eventId: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<RequeueDeadLetterResponse> {
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key must be 16-128 URL-safe characters");
    }
    const normalizedReason = reason.trim().replace(/\s+/g, " ");
    const requestHash = createHash("sha256").update(JSON.stringify({ eventId, reason: normalizedReason }), "utf8").digest("hex");
    return this.database.withControlPlaneTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO platform_operation_requests (
           idempotency_key, operation_type, actor_id, request_hash, status, resource_type, resource_id
         ) VALUES ($1,'outbox-dead-letter-requeue',$2,$3,'processing','outbox-event',$4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, principal.userId, requestHash, eventId],
      );
      if (inserted.rowCount === 0) {
        const existingResult = await client.query<OperationRequestRow>(
          `SELECT operation_type, request_hash, status, resource_type, resource_id, response
           FROM platform_operation_requests WHERE idempotency_key = $1 FOR UPDATE`,
          [idempotencyKey],
        );
        const existing = existingResult.rows[0];
        if (!existing || existing.operation_type !== "outbox-dead-letter-requeue" || existing.resource_id !== eventId || existing.request_hash !== requestHash) {
          throw new ConflictException("Idempotency-Key was already used for another platform operation");
        }
        if (existing.status === "completed" && existing.response) return existing.response;
        throw new ConflictException("The dead-letter requeue operation is already in progress");
      }

      const result = await client.query<DeadLetterRow>(
        `SELECT id, tenant_id, event_name, event_version, aggregate_type, aggregate_id,
                aggregate_version, attempts, last_error, occurred_at, dead_lettered_at
         FROM outbox_events WHERE id = $1 FOR UPDATE`,
        [eventId],
      );
      const event = result.rows[0];
      if (!event) throw new NotFoundException("Dead-letter event was not found");
      if (!event.dead_lettered_at) throw new ConflictException("Outbox event is not in dead-letter state");

      const queuedAt = new Date().toISOString();
      await client.query(
        `UPDATE outbox_events
         SET attempts = 0, next_attempt_at = now(), dead_lettered_at = NULL,
             leased_at = NULL, lease_owner = NULL, last_error = NULL
         WHERE id = $1 AND dead_lettered_at IS NOT NULL AND published_at IS NULL`,
        [eventId],
      );
      const errorFingerprint = event.last_error
        ? createHash("sha256").update(event.last_error, "utf8").digest("hex")
        : undefined;
      await this.tenantAudit.append(client, {
        tenantId: event.tenant_id as TenantId,
        plane: "control",
        eventType: "outbox.dead-letter-requeued",
        actorId: principal.userId as UserId,
        resourceType: "outbox-event",
        resourceId: event.id,
        purpose: normalizedReason,
        correlationId,
        beforeState: { state: "dead-letter", attempts: event.attempts },
        afterState: { state: "queued", attempts: 0 },
        metadata: { eventName: event.event_name, aggregateType: event.aggregate_type, aggregateId: event.aggregate_id },
      });
      await this.platformAudit.append(client, {
        eventType: "platform.outbox-dead-letter-requeued",
        actorId: principal.userId,
        resourceType: "outbox-event",
        resourceId: event.id,
        correlationId,
        metadata: {
          tenantId: event.tenant_id,
          eventName: event.event_name,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          previousAttempts: event.attempts,
          deadLetteredAt: event.dead_lettered_at.toISOString(),
          ...(errorFingerprint ? { errorFingerprint } : {}),
          reason: normalizedReason,
        },
      });
      const response: RequeueDeadLetterResponse = { eventId, state: "queued", queuedAt, previousAttempts: event.attempts };
      await client.query(
        `UPDATE platform_operation_requests
         SET status = 'completed', response = $2, updated_at = now()
         WHERE idempotency_key = $1`,
        [idempotencyKey, response],
      );
      return response;
    });
  }
}
