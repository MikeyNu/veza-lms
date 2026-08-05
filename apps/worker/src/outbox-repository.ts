import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { ClaimedOutboxEvent } from "./outbox.types.js";

interface OutboxRow extends QueryResultRow {
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
  readonly attempts: number;
}

function mapRow(row: OutboxRow): ClaimedOutboxEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventName: row.event_name,
    eventVersion: row.event_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    actorId: row.actor_id,
    correlationId: row.correlation_id,
    payload: row.payload,
    occurredAt: row.occurred_at.toISOString(),
    attempts: row.attempts,
  };
}

async function transaction<TResult>(
  pool: Pool,
  work: (client: PoolClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class OutboxRepository {
  constructor(private readonly pool: Pool) {}

  async claim(
    owner: string,
    batchSize: number,
    leaseSeconds: number,
  ): Promise<readonly ClaimedOutboxEvent[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<OutboxRow>(
        `WITH candidates AS (
           SELECT id
           FROM outbox_events
           WHERE published_at IS NULL
             AND dead_lettered_at IS NULL
             AND next_attempt_at <= now()
             AND (leased_at IS NULL OR leased_at < now() - ($3::int * interval '1 second'))
           ORDER BY next_attempt_at, occurred_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE outbox_events event
         SET leased_at = now(), lease_owner = $1, attempts = event.attempts + 1
         FROM candidates
         WHERE event.id = candidates.id
         RETURNING event.id, event.tenant_id, event.event_name, event.event_version,
                   event.aggregate_type, event.aggregate_id, event.aggregate_version,
                   event.actor_id, event.correlation_id, event.payload,
                   event.occurred_at, event.attempts`,
        [owner, batchSize, leaseSeconds],
      );
      return result.rows.map(mapRow);
    });
  }

  async markPublished(
    owner: string,
    event: ClaimedOutboxEvent,
    destinationKey: string,
    reference: string | undefined,
    latencyMs: number,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE outbox_events
         SET published_at = now(), published_reference = $4,
             leased_at = NULL, lease_owner = NULL, last_error = NULL
         WHERE id = $1 AND lease_owner = $2 AND attempts = $3
           AND published_at IS NULL AND dead_lettered_at IS NULL`,
        [event.id, owner, event.attempts, reference ?? null],
      );
      if (result.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO event_delivery_evidence (
           tenant_id, outbox_event_id, delivery_stage, destination_key,
           attempt_number, state, worker_id, provider_reference, latency_ms
         ) VALUES ($1,$2,'transport',$3,$4,'delivered',$5,$6,$7)`,
        [
          event.tenantId,
          event.id,
          destinationKey,
          event.attempts,
          owner,
          reference ?? null,
          latencyMs,
        ],
      );
      await client.query("SELECT app.enqueue_event_consumers($1)", [event.id]);
      return true;
    });
  }

  async markFailed(
    owner: string,
    event: ClaimedOutboxEvent,
    destinationKey: string,
    error: string,
    nextAttempt: Date,
    deadLetter: boolean,
    latencyMs: number,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE outbox_events
         SET last_error = $4,
             next_attempt_at = $5,
             dead_lettered_at = CASE WHEN $6::boolean THEN now() ELSE NULL END,
             leased_at = NULL,
             lease_owner = NULL
         WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND published_at IS NULL`,
        [
          event.id,
          owner,
          event.attempts,
          error.slice(0, 2_000),
          nextAttempt,
          deadLetter,
        ],
      );
      if (result.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO event_delivery_evidence (
           tenant_id, outbox_event_id, delivery_stage, destination_key,
           attempt_number, state, worker_id, error_code, latency_ms
         ) VALUES ($1,$2,'transport',$3,$4,$5,$6,$7,$8)`,
        [
          event.tenantId,
          event.id,
          destinationKey,
          event.attempts,
          deadLetter ? "dead-letter" : "retry",
          owner,
          error.slice(0, 160),
          latencyMs,
        ],
      );
      return true;
    });
  }
}
