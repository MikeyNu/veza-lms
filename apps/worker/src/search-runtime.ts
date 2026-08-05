import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { ClaimedConsumerDelivery } from "./consumer-repository.js";
import type { ConsumerHandler, ConsumerHandlerResult } from "./consumer-runtime.js";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";
import type { ScheduledJobHandler } from "./scheduler.js";

interface SearchOperation extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly document_id: string;
  readonly operation: "upsert" | "delete";
  readonly document_snapshot: Readonly<Record<string, unknown>>;
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

export class SearchProjectionEventHandler implements ConsumerHandler {
  constructor(private readonly pool: Pool) {}

  async handle(delivery: ClaimedConsumerDelivery): Promise<ConsumerHandlerResult> {
    const result = await this.pool.query<{ result: Readonly<Record<string, unknown>> }>(
      "SELECT app.refresh_search_projection($1) result",
      [delivery.tenantId],
    );
    return {
      handlerVersion: "search.projection-events.v1",
      evidence: result.rows[0]?.result ?? { tenantId: delivery.tenantId },
    };
  }
}

export class SearchProjectionScheduleHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(
    payload: Readonly<Record<string, unknown>>,
    tenantId: string | null,
  ): Promise<Readonly<Record<string, unknown>>> {
    const resolvedTenantId =
      tenantId ?? (typeof payload.tenantId === "string" ? payload.tenantId : undefined);
    if (!resolvedTenantId) throw new Error("search-projection-tenant-missing");
    const result = await this.pool.query<{ result: Readonly<Record<string, unknown>> }>(
      "SELECT app.refresh_search_projection($1) result",
      [resolvedTenantId],
    );
    return result.rows[0]?.result ?? { tenantId: resolvedTenantId };
  }
}

export class SearchIndexPublisher {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {}

  private async claim(): Promise<readonly SearchOperation[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<SearchOperation>(
        `WITH candidates AS (
           SELECT operation.id
           FROM search_index_operations operation
           WHERE operation.state IN ('pending','retry')
             AND operation.next_attempt_at <= now()
             AND (operation.leased_at IS NULL OR operation.leased_at < now() - interval '2 minutes')
           ORDER BY operation.next_attempt_at, operation.created_at, operation.id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE search_index_operations operation
         SET state = 'processing', attempts = attempts + 1,
             leased_at = now(), lease_owner = $1
         FROM candidates
         WHERE operation.id = candidates.id
         RETURNING operation.id, operation.tenant_id, operation.document_id,
                   operation.operation, operation.document_snapshot,
                   operation.attempts, operation.maximum_attempts`,
        [this.workerId, this.batchSize],
      );
      return result.rows;
    });
  }

  private async publish(operation: SearchOperation): Promise<string> {
    const endpoint = process.env.OPENSEARCH_INDEX_ENDPOINT?.replace(/\/$/, "");
    const documentKey = String(operation.document_snapshot.documentKey ?? operation.document_id);
    if (!endpoint) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("opensearch-index-endpoint-unavailable");
      }
      return `postgres-fallback:${documentKey}`;
    }
    const indexPrefix = process.env.OPENSEARCH_INDEX_PREFIX ?? "veza";
    const tenantIndex = `${indexPrefix}-${operation.tenant_id}`.toLowerCase();
    const url = `${endpoint}/${encodeURIComponent(tenantIndex)}/_doc/${encodeURIComponent(documentKey)}`;
    const response = await fetch(url, {
      method: operation.operation === "delete" ? "DELETE" : "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(process.env.OPENSEARCH_INDEX_TOKEN
          ? { authorization: `Bearer ${process.env.OPENSEARCH_INDEX_TOKEN}` }
          : {}),
        "x-veza-tenant-id": operation.tenant_id,
        "x-veza-operation-id": operation.id,
      },
      ...(operation.operation === "upsert"
        ? { body: JSON.stringify(operation.document_snapshot) }
        : {}),
      signal: AbortSignal.timeout(Number(process.env.OPENSEARCH_TIMEOUT_MS ?? 15_000)),
    });
    if (!response.ok && !(operation.operation === "delete" && response.status === 404)) {
      throw new Error(`opensearch-http-${response.status}`);
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return String(body._seq_no ?? body.result ?? documentKey);
  }

  private async complete(operation: SearchOperation, reference: string): Promise<void> {
    await this.pool.query(
      `UPDATE search_index_operations
       SET state = 'completed', provider_reference = $4,
           completed_at = now(), last_error = NULL,
           leased_at = NULL, lease_owner = NULL
       WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND state = 'processing'`,
      [operation.id, this.workerId, operation.attempts, reference],
    );
  }

  private async fail(operation: SearchOperation, error: unknown): Promise<void> {
    const deadLetter = operation.attempts >= operation.maximum_attempts;
    const delay = retryDelaySeconds(
      operation.id,
      operation.attempts,
      this.retryBaseSeconds,
      this.retryMaximumSeconds,
    );
    await this.pool.query(
      `UPDATE search_index_operations
       SET state = $4, next_attempt_at = $5, last_error = $6,
           completed_at = CASE WHEN $4 = 'dead-letter' THEN now() ELSE NULL END,
           leased_at = NULL, lease_owner = NULL
       WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND state = 'processing'`,
      [
        operation.id,
        this.workerId,
        operation.attempts,
        deadLetter ? "dead-letter" : "retry",
        nextAttemptAt(new Date(), delay),
        sanitizeDeliveryError(error).slice(0, 2_000),
      ],
    );
  }

  async processDue(): Promise<{
    readonly claimed: number;
    readonly completed: number;
    readonly failed: number;
  }> {
    const operations = await this.claim();
    let completed = 0;
    let failed = 0;
    for (const operation of operations) {
      try {
        await this.complete(operation, await this.publish(operation));
        completed += 1;
      } catch (error) {
        await this.fail(operation, error);
        failed += 1;
      }
    }
    return { claimed: operations.length, completed, failed };
  }
}
