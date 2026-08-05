import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import type {
  ApproveEventSchemaDto,
  CreateEventConsumerDto,
  CreateEventSchemaDto,
  CreateScheduledJobDto,
  ReplayEventDto,
  SubmitEventSchemaDto,
  UpdateConsumerStatusDto,
} from "./event-operations.dto.js";

interface EventRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_name: string;
  readonly event_version: number;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly aggregate_version: number;
  readonly actor_id: string;
  readonly correlation_id: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurred_at: Date;
}

interface OperationRow extends QueryResultRow {
  readonly operation_type: string;
  readonly request_hash: string;
  readonly status: string;
  readonly resource_id: string;
  readonly response: Readonly<Record<string, unknown>> | null;
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function payloadChecksum(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function normalizeReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function appendPlatformAudit(
  client: PoolClient,
  principal: AuthenticatedPrincipal,
  eventType: string,
  resourceType: string,
  resourceId: string,
  correlationId: string,
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  await client.query(
    `INSERT INTO platform_audit_events (
       event_type, actor_id, resource_type, resource_id, correlation_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [eventType, principal.userId, resourceType, resourceId, correlationId, metadata],
  );
}

@Injectable()
export class EventOperationsService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    const [summary, consumers, recentRuns, recentDeliveries] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT
           count(*) FILTER (WHERE published_at IS NULL AND dead_lettered_at IS NULL) backlog_count,
           count(*) FILTER (WHERE published_at IS NULL AND dead_lettered_at IS NOT NULL) dead_letter_count,
           min(occurred_at) FILTER (WHERE published_at IS NULL AND dead_lettered_at IS NULL) oldest_backlog_at,
           count(*) FILTER (WHERE published_at IS NOT NULL AND published_at >= now() - interval '24 hours') delivered_24h
         FROM outbox_events`,
      ),
      this.database.controlPlaneQuery(
        `SELECT consumer.consumer_key, consumer.display_name, consumer.destination_type,
                consumer.status, consumer.maximum_attempts,
                count(inbox.id) FILTER (WHERE inbox.state IN ('pending','retry','processing')) pending_count,
                count(inbox.id) FILTER (WHERE inbox.state = 'dead-letter') dead_letter_count,
                min(inbox.first_seen_at) FILTER (WHERE inbox.state IN ('pending','retry','processing')) oldest_pending_at,
                max(inbox.completed_at) last_completed_at
         FROM event_consumer_definitions consumer
         LEFT JOIN event_consumer_inbox inbox ON inbox.consumer_key = consumer.consumer_key
         GROUP BY consumer.consumer_key, consumer.display_name, consumer.destination_type,
                  consumer.status, consumer.maximum_attempts
         ORDER BY consumer.display_name`,
      ),
      this.database.controlPlaneQuery(
        `SELECT id, worker_id, state, backlog_count, dead_letter_count,
                consumer_lag_count, oldest_backlog_at, findings,
                started_at, completed_at, error_code
         FROM event_reconciliation_runs
         ORDER BY started_at DESC, id DESC
         LIMIT 20`,
      ),
      this.database.controlPlaneQuery(
        `SELECT evidence.id, evidence.tenant_id, evidence.outbox_event_id,
                event.event_name, evidence.delivery_stage, evidence.destination_key,
                evidence.attempt_number, evidence.state, evidence.worker_id,
                evidence.provider_reference, evidence.error_code,
                evidence.latency_ms, evidence.recorded_at
         FROM event_delivery_evidence evidence
         JOIN outbox_events event ON event.id = evidence.outbox_event_id
         ORDER BY evidence.recorded_at DESC, evidence.id DESC
         LIMIT 50`,
      ),
    ]);
    const row = summary.rows[0] ?? {};
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        backlogCount: Number(row.backlog_count ?? 0),
        deadLetterCount: Number(row.dead_letter_count ?? 0),
        oldestBacklogAt: row.oldest_backlog_at ?? null,
        delivered24h: Number(row.delivered_24h ?? 0),
      },
      consumers: consumers.rows.map((consumer) => ({
        consumerKey: consumer.consumer_key,
        displayName: consumer.display_name,
        destinationType: consumer.destination_type,
        status: consumer.status,
        maximumAttempts: Number(consumer.maximum_attempts),
        pendingCount: Number(consumer.pending_count ?? 0),
        deadLetterCount: Number(consumer.dead_letter_count ?? 0),
        oldestPendingAt: consumer.oldest_pending_at ?? null,
        lastCompletedAt: consumer.last_completed_at ?? null,
      })),
      reconciliationRuns: recentRuns.rows,
      recentDeliveries: recentDeliveries.rows,
    };
  }

  async schemas() {
    const result = await this.database.controlPlaneQuery(
      `SELECT id, event_name, major_version, minor_version, owner_context,
              classification, compatibility, payload_schema, status, version,
              created_by, submitted_by, submitted_at, approved_by, approved_at,
              approval_reason, created_at, updated_at
       FROM event_schema_registry
       ORDER BY event_name, major_version DESC, minor_version DESC`,
    );
    return result.rows;
  }

  async createSchema(
    principal: AuthenticatedPrincipal,
    input: CreateEventSchemaDto,
    correlationId: string,
  ) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO event_schema_registry (
           event_name, major_version, minor_version, owner_context,
           classification, compatibility, payload_schema, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, version`,
        [
          input.eventName,
          input.majorVersion,
          input.minorVersion,
          input.ownerContext,
          input.classification,
          input.compatibility,
          input.payloadSchema,
          principal.userId,
        ],
      );
      const schema = result.rows[0];
      await appendPlatformAudit(
        client,
        principal,
        "platform.event-schema.created",
        "event-schema",
        schema.id,
        correlationId,
        {
          eventName: input.eventName,
          majorVersion: input.majorVersion,
          minorVersion: input.minorVersion,
          ownerContext: input.ownerContext,
        },
      );
      return { id: schema.id, status: "draft", version: schema.version };
    });
  }

  async submitSchema(
    principal: AuthenticatedPrincipal,
    schemaId: string,
    input: SubmitEventSchemaDto,
    correlationId: string,
  ) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `UPDATE event_schema_registry
         SET submitted_by = $3, submitted_at = now(), version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2 AND status = 'draft' AND submitted_at IS NULL
         RETURNING event_name, major_version, minor_version, version`,
        [schemaId, input.expectedVersion, principal.userId],
      );
      if (!result.rowCount) throw new ConflictException("Event schema is stale or already submitted");
      await appendPlatformAudit(
        client,
        principal,
        "platform.event-schema.submitted",
        "event-schema",
        schemaId,
        correlationId,
        result.rows[0],
      );
      return { id: schemaId, status: "in-review", version: result.rows[0].version };
    });
  }

  async approveSchema(
    principal: AuthenticatedPrincipal,
    schemaId: string,
    input: ApproveEventSchemaDto,
    correlationId: string,
  ) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const current = await client.query(
        `SELECT event_name, major_version, submitted_by, created_by, status, version
         FROM event_schema_registry WHERE id = $1 FOR UPDATE`,
        [schemaId],
      );
      const schema = current.rows[0];
      if (!schema) throw new NotFoundException("Event schema was not found");
      if (schema.status !== "draft" || !schema.submitted_by || schema.version !== input.expectedVersion) {
        throw new ConflictException("Event schema is stale or not awaiting approval");
      }
      if (schema.created_by === principal.userId || schema.submitted_by === principal.userId) {
        throw new ConflictException("Event schema approval requires an independent reviewer");
      }
      await client.query(
        `UPDATE event_schema_registry
         SET status = 'deprecated', version = version + 1, updated_at = now()
         WHERE event_name = $1 AND major_version = $2 AND status = 'active'`,
        [schema.event_name, schema.major_version],
      );
      const updated = await client.query(
        `UPDATE event_schema_registry
         SET status = 'active', approved_by = $2, approved_at = now(),
             approval_reason = $3, version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`,
        [schemaId, principal.userId, normalizeReason(input.reason)],
      );
      await appendPlatformAudit(
        client,
        principal,
        "platform.event-schema.approved",
        "event-schema",
        schemaId,
        correlationId,
        {
          eventName: schema.event_name,
          majorVersion: schema.major_version,
          reason: normalizeReason(input.reason),
        },
      );
      return { id: schemaId, status: "active", version: updated.rows[0].version };
    });
  }

  async createConsumer(
    principal: AuthenticatedPrincipal,
    input: CreateEventConsumerDto,
    correlationId: string,
  ) {
    for (const subscription of input.subscriptions) {
      if (subscription.maximumMajorVersion < subscription.minimumMajorVersion) {
        throw new BadRequestException("Consumer subscription version range is invalid");
      }
    }
    return this.database.withControlPlaneTransaction(async (client) => {
      await client.query(
        `INSERT INTO event_consumer_definitions (
           consumer_key, display_name, handler_key, destination_type,
           maximum_attempts, lease_seconds, status, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'paused',$7)`,
        [
          input.consumerKey,
          input.displayName.trim(),
          input.handlerKey,
          input.destinationType,
          input.maximumAttempts,
          input.leaseSeconds,
          principal.userId,
        ],
      );
      for (const subscription of input.subscriptions) {
        await client.query(
          `INSERT INTO event_consumer_subscriptions (
             consumer_key, event_pattern, minimum_major_version, maximum_major_version
           ) VALUES ($1,$2,$3,$4)`,
          [
            input.consumerKey,
            subscription.eventPattern,
            subscription.minimumMajorVersion,
            subscription.maximumMajorVersion,
          ],
        );
      }
      await appendPlatformAudit(
        client,
        principal,
        "platform.event-consumer.created",
        "event-consumer",
        input.consumerKey,
        correlationId,
        {
          handlerKey: input.handlerKey,
          destinationType: input.destinationType,
          subscriptions: input.subscriptions,
        },
      );
      return { consumerKey: input.consumerKey, status: "paused" };
    });
  }

  async updateConsumerStatus(
    principal: AuthenticatedPrincipal,
    consumerKey: string,
    input: UpdateConsumerStatusDto,
    correlationId: string,
  ) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE event_consumer_definitions
         SET status = $2, updated_at = now()
         WHERE consumer_key = $1 AND status <> 'retired'
         RETURNING status`,
        [consumerKey, input.status],
      );
      if (!updated.rowCount) throw new NotFoundException("Active event consumer was not found");
      await appendPlatformAudit(
        client,
        principal,
        "platform.event-consumer.status-changed",
        "event-consumer",
        consumerKey,
        correlationId,
        { status: input.status, reason: normalizeReason(input.reason) },
      );
      return { consumerKey, status: input.status };
    });
  }

  async replay(
    principal: AuthenticatedPrincipal,
    eventId: string,
    input: ReplayEventDto,
    idempotencyKey: string,
    correlationId: string,
  ) {
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key must be 16-128 URL-safe characters");
    }
    const hash = requestHash({ eventId, consumerKey: input.consumerKey, reason: input.reason });
    return this.database.withControlPlaneTransaction(async (client) => {
      const insertedOperation = await client.query(
        `INSERT INTO platform_operation_requests (
           idempotency_key, operation_type, actor_id, request_hash,
           status, resource_type, resource_id
         ) VALUES ($1,'event-replay',$2,$3,'processing','outbox-event',$4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, principal.userId, hash, eventId],
      );
      if (!insertedOperation.rowCount) {
        const existing = await client.query<OperationRow>(
          `SELECT operation_type, request_hash, status, resource_id, response
           FROM platform_operation_requests WHERE idempotency_key = $1 FOR UPDATE`,
          [idempotencyKey],
        );
        const operation = existing.rows[0];
        if (
          !operation ||
          operation.operation_type !== "event-replay" ||
          operation.request_hash !== hash ||
          operation.resource_id !== eventId
        ) {
          throw new ConflictException("Idempotency-Key was used for another operation");
        }
        if (operation.status === "completed" && operation.response) return operation.response;
        throw new ConflictException("Event replay is already in progress");
      }

      const eventResult = await client.query<EventRow>(
        `SELECT id, tenant_id, event_name, event_version, aggregate_type,
                aggregate_id, aggregate_version, actor_id, correlation_id,
                payload, occurred_at
         FROM outbox_events WHERE id = $1`,
        [eventId],
      );
      const event = eventResult.rows[0];
      if (!event) throw new NotFoundException("Outbox event was not found");

      const consumers = await client.query<{ consumer_key: string } & QueryResultRow>(
        `SELECT DISTINCT subscription.consumer_key
         FROM event_consumer_subscriptions subscription
         JOIN event_consumer_definitions consumer
           ON consumer.consumer_key = subscription.consumer_key
          AND consumer.status = 'active'
         WHERE app.event_pattern_matches(subscription.event_pattern, $1)
           AND $2 BETWEEN subscription.minimum_major_version AND subscription.maximum_major_version
           AND ($3::text IS NULL OR subscription.consumer_key = $3)`,
        [event.event_name, event.event_version, input.consumerKey ?? null],
      );
      if (!consumers.rowCount) throw new ConflictException("No active consumer accepts this event version");

      const replayRequest = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO event_replay_requests (
           outbox_event_id, consumer_key, requested_by, reason, status
         ) VALUES ($1,$2,$3,$4,'processing')
         RETURNING id`,
        [eventId, input.consumerKey ?? null, principal.userId, normalizeReason(input.reason)],
      );
      const envelope = {
        schemaVersion: 1,
        eventId: event.id,
        tenantId: event.tenant_id,
        eventName: event.event_name,
        eventVersion: event.event_version,
        aggregate: {
          type: event.aggregate_type,
          id: event.aggregate_id,
          version: event.aggregate_version,
        },
        actorId: event.actor_id,
        correlationId: event.correlation_id,
        occurredAt: event.occurred_at.toISOString(),
        payload: event.payload,
        replay: { requestId: replayRequest.rows[0].id, reason: normalizeReason(input.reason) },
      };
      let maximumSequence = 0;
      for (const consumer of consumers.rows) {
        const sequenceResult = await client.query<{ sequence: number } & QueryResultRow>(
          `SELECT COALESCE(max(replay_sequence),0) + 1 sequence
           FROM event_consumer_inbox
           WHERE consumer_key = $1 AND outbox_event_id = $2`,
          [consumer.consumer_key, eventId],
        );
        const sequence = Number(sequenceResult.rows[0]?.sequence ?? 1);
        maximumSequence = Math.max(maximumSequence, sequence);
        await client.query(
          `INSERT INTO event_consumer_inbox (
             tenant_id, consumer_key, outbox_event_id, replay_sequence,
             event_name, event_version, envelope, payload_checksum
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            event.tenant_id,
            consumer.consumer_key,
            event.id,
            sequence,
            event.event_name,
            event.event_version,
            envelope,
            payloadChecksum(event.payload),
          ],
        );
        await client.query(
          `INSERT INTO event_delivery_evidence (
             tenant_id, outbox_event_id, delivery_stage, destination_key,
             attempt_number, state, worker_id, metadata
           ) VALUES ($1,$2,'replay',$3,$4,'started','control-plane',$5)`,
          [
            event.tenant_id,
            event.id,
            consumer.consumer_key,
            sequence,
            { replayRequestId: replayRequest.rows[0].id },
          ],
        );
      }
      await client.query(
        `UPDATE event_replay_requests
         SET status = 'completed', replay_sequence = $2, completed_at = now()
         WHERE id = $1`,
        [replayRequest.rows[0].id, maximumSequence],
      );
      const response = {
        replayRequestId: replayRequest.rows[0].id,
        eventId,
        consumerCount: consumers.rowCount,
        replaySequence: maximumSequence,
        status: "queued",
      };
      await client.query(
        `UPDATE platform_operation_requests
         SET status = 'completed', response = $2, updated_at = now()
         WHERE idempotency_key = $1`,
        [idempotencyKey, response],
      );
      await appendPlatformAudit(
        client,
        principal,
        "platform.event.replayed",
        "outbox-event",
        eventId,
        correlationId,
        {
          replayRequestId: replayRequest.rows[0].id,
          consumerKey: input.consumerKey ?? "all-active",
          consumerCount: consumers.rowCount,
          reason: normalizeReason(input.reason),
        },
      );
      return response;
    });
  }

  async createScheduledJob(
    principal: AuthenticatedPrincipal,
    input: CreateScheduledJobDto,
    correlationId: string,
  ) {
    if (!Number.isFinite(Date.parse(input.nextRunAt))) {
      throw new BadRequestException("Scheduled job start time is invalid");
    }
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO scheduled_jobs (
           tenant_id, job_key, handler_key, payload, interval_seconds,
           next_run_at, status, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'paused',$7)
         RETURNING id, version`,
        [
          input.tenantId ?? null,
          input.jobKey,
          input.handlerKey,
          input.payload,
          input.intervalSeconds ?? null,
          input.nextRunAt,
          principal.userId,
        ],
      );
      await appendPlatformAudit(
        client,
        principal,
        "platform.scheduled-job.created",
        "scheduled-job",
        result.rows[0].id,
        correlationId,
        {
          jobKey: input.jobKey,
          handlerKey: input.handlerKey,
          tenantId: input.tenantId ?? null,
        },
      );
      return { id: result.rows[0].id, status: "paused", version: result.rows[0].version };
    });
  }
}
