import type { Pool, PoolClient, QueryResultRow } from "pg";

export interface ClaimedConsumerDelivery {
  readonly id: string;
  readonly tenantId: string;
  readonly consumerKey: string;
  readonly handlerKey: string;
  readonly outboxEventId: string;
  readonly replaySequence: number;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly envelope: Readonly<Record<string, unknown>>;
  readonly attempts: number;
  readonly maximumAttempts: number;
}

interface ConsumerRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly consumer_key: string;
  readonly handler_key: string;
  readonly outbox_event_id: string;
  readonly replay_sequence: number;
  readonly event_name: string;
  readonly event_version: number;
  readonly envelope: Readonly<Record<string, unknown>>;
  readonly attempts: number;
  readonly maximum_attempts: number;
}

async function transaction<TResult>(
  pool: Pool,
  work: (client: PoolClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapRow(row: ConsumerRow): ClaimedConsumerDelivery {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    consumerKey: row.consumer_key,
    handlerKey: row.handler_key,
    outboxEventId: row.outbox_event_id,
    replaySequence: row.replay_sequence,
    eventName: row.event_name,
    eventVersion: row.event_version,
    envelope: row.envelope,
    attempts: row.attempts,
    maximumAttempts: row.maximum_attempts,
  };
}

export class ConsumerRepository {
  constructor(private readonly pool: Pool) {}

  async claim(owner: string, batchSize: number): Promise<readonly ClaimedConsumerDelivery[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<ConsumerRow>(
        `WITH candidates AS (
           SELECT inbox.id
           FROM event_consumer_inbox inbox
           JOIN event_consumer_definitions consumer
             ON consumer.consumer_key = inbox.consumer_key
            AND consumer.status = 'active'
           WHERE inbox.state IN ('pending','retry')
             AND inbox.next_attempt_at <= now()
             AND (
               inbox.leased_at IS NULL OR
               inbox.leased_at < now() - (consumer.lease_seconds * interval '1 second')
             )
           ORDER BY inbox.next_attempt_at, inbox.first_seen_at, inbox.id
           FOR UPDATE OF inbox SKIP LOCKED
           LIMIT $2
         )
         UPDATE event_consumer_inbox inbox
         SET state = 'processing',
             attempts = inbox.attempts + 1,
             leased_at = now(),
             lease_owner = $1,
             last_attempt_at = now()
         FROM candidates,
              event_consumer_definitions consumer
         WHERE inbox.id = candidates.id
           AND consumer.consumer_key = inbox.consumer_key
         RETURNING inbox.id,
                   inbox.tenant_id,
                   inbox.consumer_key,
                   consumer.handler_key,
                   inbox.outbox_event_id,
                   inbox.replay_sequence,
                   inbox.event_name,
                   inbox.event_version,
                   inbox.envelope,
                   inbox.attempts,
                   consumer.maximum_attempts`,
        [owner, batchSize],
      );
      return result.rows.map(mapRow);
    });
  }

  async complete(
    owner: string,
    delivery: ClaimedConsumerDelivery,
    handlerVersion: string,
    resultChecksum: string,
    latencyMs: number,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const updated = await client.query(
        `UPDATE event_consumer_inbox
         SET state = 'completed',
             completed_at = now(),
             handler_version = $4,
             result_checksum = $5,
             last_error = NULL,
             leased_at = NULL,
             lease_owner = NULL
         WHERE id = $1
           AND lease_owner = $2
           AND state = 'processing'
           AND attempts = $3`,
        [delivery.id, owner, delivery.attempts, handlerVersion, resultChecksum],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO event_delivery_evidence (
           tenant_id, outbox_event_id, delivery_stage, destination_key,
           attempt_number, state, worker_id, latency_ms, metadata
         ) VALUES ($1,$2,'consumer',$3,$4,'delivered',$5,$6,$7)`,
        [
          delivery.tenantId,
          delivery.outboxEventId,
          delivery.consumerKey,
          delivery.attempts,
          owner,
          latencyMs,
          {
            handlerVersion,
            replaySequence: delivery.replaySequence,
            resultChecksum,
          },
        ],
      );
      return true;
    });
  }

  async fail(
    owner: string,
    delivery: ClaimedConsumerDelivery,
    errorCode: string,
    nextAttemptAt: Date,
    deadLetter: boolean,
    latencyMs: number,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const updated = await client.query(
        `UPDATE event_consumer_inbox
         SET state = CASE WHEN $5::boolean THEN 'dead-letter' ELSE 'retry' END,
             next_attempt_at = $4,
             last_error = $6,
             leased_at = NULL,
             lease_owner = NULL
         WHERE id = $1
           AND lease_owner = $2
           AND state = 'processing'
           AND attempts = $3`,
        [
          delivery.id,
          owner,
          delivery.attempts,
          nextAttemptAt,
          deadLetter,
          errorCode.slice(0, 2_000),
        ],
      );
      if (updated.rowCount !== 1) return false;
      await client.query(
        `INSERT INTO event_delivery_evidence (
           tenant_id, outbox_event_id, delivery_stage, destination_key,
           attempt_number, state, worker_id, error_code, latency_ms, metadata
         ) VALUES ($1,$2,'consumer',$3,$4,$5,$6,$7,$8,$9)`,
        [
          delivery.tenantId,
          delivery.outboxEventId,
          delivery.consumerKey,
          delivery.attempts,
          deadLetter ? "dead-letter" : "retry",
          owner,
          errorCode.slice(0, 160),
          latencyMs,
          { replaySequence: delivery.replaySequence },
        ],
      );
      return true;
    });
  }
}
