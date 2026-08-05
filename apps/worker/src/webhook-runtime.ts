import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { ClaimedConsumerDelivery } from "./consumer-repository.js";
import type { ConsumerHandler, ConsumerHandlerResult } from "./consumer-runtime.js";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";
import type { ScheduledJobHandler } from "./scheduler.js";

interface WebhookDeliveryRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly endpoint_url: string;
  readonly secret_reference: string;
  readonly envelope: Readonly<Record<string, unknown>>;
  readonly attempts: number;
  readonly maximum_attempts: number;
  readonly timeout_ms: number;
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

function checksum(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function environmentSecret(reference: string): string | undefined {
  if (!reference.startsWith("env:")) return undefined;
  const key = reference.slice(4);
  if (!/^[A-Z][A-Z0-9_]{2,119}$/.test(key)) return undefined;
  return process.env[key];
}

async function resolveSecret(reference: string): Promise<string> {
  const direct = environmentSecret(reference);
  if (direct) return direct;
  const endpoint = process.env.WEBHOOK_SECRET_RESOLVER_URL?.trim();
  if (!endpoint) throw new Error("webhook-secret-resolver-unavailable");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(process.env.WEBHOOK_SECRET_RESOLVER_TOKEN
        ? { authorization: `Bearer ${process.env.WEBHOOK_SECRET_RESOLVER_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ reference }),
    signal: AbortSignal.timeout(5_000),
  });
  const body = (await response.json().catch(() => ({}))) as { secret?: string; message?: string };
  if (!response.ok || !body.secret) {
    throw new Error(body.message ?? `webhook-secret-resolver-http-${response.status}`);
  }
  return body.secret;
}

export class WebhookRouter implements ConsumerHandler {
  constructor(private readonly pool: Pool) {}

  async handle(delivery: ClaimedConsumerDelivery): Promise<ConsumerHandlerResult> {
    const envelope = delivery.envelope;
    const result = await transaction(this.pool, async (client) => {
      const endpoints = await client.query<{
        id: string;
        event_patterns: string[];
      } & QueryResultRow>(
        `SELECT id,event_patterns
         FROM webhook_endpoints
         WHERE tenant_id=$1 AND status='active'`,
        [delivery.tenantId],
      );
      let routed = 0;
      const body = JSON.stringify(envelope);
      const payloadChecksum = checksum(body);
      for (const endpoint of endpoints.rows) {
        const matched = await client.query<{ matched: boolean } & QueryResultRow>(
          `SELECT bool_or(app.webhook_pattern_matches(pattern,$2)) matched
           FROM unnest($1::text[]) pattern`,
          [endpoint.event_patterns, delivery.eventName],
        );
        if (!matched.rows[0]?.matched) continue;
        await client.query(
          `INSERT INTO webhook_deliveries (
             tenant_id,webhook_endpoint_id,outbox_event_id,replay_sequence,
             envelope,payload_checksum
           ) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (
             tenant_id,webhook_endpoint_id,outbox_event_id,replay_sequence
           ) DO NOTHING`,
          [
            delivery.tenantId,
            endpoint.id,
            delivery.outboxEventId,
            delivery.replaySequence,
            envelope,
            payloadChecksum,
          ],
        );
        routed += 1;
      }
      return routed;
    });
    return {
      handlerVersion: "api.webhook-router.v1",
      evidence: {
        eventName: delivery.eventName,
        routedEndpoints: result,
        replaySequence: delivery.replaySequence,
      },
    };
  }
}

export class WebhookDispatcher {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {}

  private async claim(): Promise<readonly WebhookDeliveryRow[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<WebhookDeliveryRow>(
        `WITH candidates AS (
           SELECT delivery.id
           FROM webhook_deliveries delivery
           WHERE delivery.state IN ('pending','retry')
             AND delivery.next_attempt_at <= now()
             AND (delivery.leased_at IS NULL OR delivery.leased_at < now()-interval '5 minutes')
           ORDER BY delivery.next_attempt_at,delivery.created_at,delivery.id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE webhook_deliveries delivery
         SET state='processing',attempts=attempts+1,
             leased_at=now(),lease_owner=$1,updated_at=now()
         FROM candidates,webhook_endpoints endpoint
         WHERE delivery.id=candidates.id
           AND endpoint.id=delivery.webhook_endpoint_id
         RETURNING delivery.id,delivery.tenant_id,endpoint.endpoint_url,
                   endpoint.secret_reference,delivery.envelope,delivery.attempts,
                   endpoint.maximum_attempts,endpoint.timeout_ms`,
        [this.workerId, this.batchSize],
      );
      return result.rows;
    });
  }

  private async deliver(delivery: WebhookDeliveryRow): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(18).toString("base64url");
    const payload = JSON.stringify(delivery.envelope);
    const secret = await resolveSecret(delivery.secret_reference);
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${nonce}.${payload}`, "utf8")
      .digest("hex");
    const response = await fetch(delivery.endpoint_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "Veza-Webhook/1.0",
        "x-veza-webhook-id": delivery.id,
        "x-veza-timestamp": String(timestamp),
        "x-veza-nonce": nonce,
        "x-veza-signature-version": "v1",
        "x-veza-signature": signature,
      },
      body: payload,
      signal: AbortSignal.timeout(delivery.timeout_ms),
    });
    const responseText = (await response.text()).slice(0, 2_000);
    if (!response.ok) throw new Error(`webhook-http-${response.status}:${responseText}`);
    await this.pool.query(
      `UPDATE webhook_deliveries
       SET state='delivered',response_status=$4,response_checksum=$5,
           response_excerpt=$6,request_timestamp=$7,request_nonce=$8,
           delivered_at=now(),last_error=NULL,leased_at=NULL,
           lease_owner=NULL,updated_at=now()
       WHERE id=$1 AND lease_owner=$2 AND attempts=$3 AND state='processing'`,
      [
        delivery.id,
        this.workerId,
        delivery.attempts,
        response.status,
        checksum(responseText),
        responseText,
        timestamp,
        nonce,
      ],
    );
  }

  private async fail(delivery: WebhookDeliveryRow, error: unknown): Promise<void> {
    const deadLetter = delivery.attempts >= delivery.maximum_attempts;
    const delay = retryDelaySeconds(
      delivery.id,
      delivery.attempts,
      this.retryBaseSeconds,
      this.retryMaximumSeconds,
    );
    await this.pool.query(
      `UPDATE webhook_deliveries
       SET state=$4,next_attempt_at=$5,last_error=$6,
           leased_at=NULL,lease_owner=NULL,updated_at=now()
       WHERE id=$1 AND lease_owner=$2 AND attempts=$3 AND state='processing'`,
      [
        delivery.id,
        this.workerId,
        delivery.attempts,
        deadLetter ? "dead-letter" : "retry",
        nextAttemptAt(new Date(), delay),
        sanitizeDeliveryError(error).slice(0, 2_000),
      ],
    );
  }

  async processDue(): Promise<{ readonly claimed: number; readonly delivered: number; readonly failed: number }> {
    const rows = await this.claim();
    let delivered = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.deliver(row);
        delivered += 1;
      } catch (error) {
        await this.fail(row, error);
        failed += 1;
      }
    }
    return { claimed: rows.length, delivered, failed };
  }
}

export class WebhookReconciliationHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ reconciled: number }>(
      "SELECT app.reconcile_webhook_delivery_state() reconciled",
    );
    return { reconciled: Number(result.rows[0]?.reconciled ?? 0) };
  }
}
