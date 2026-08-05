import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { sanitizeDeliveryError } from "./delivery-error.js";
import {
  NotificationProviderRegistry,
  type NotificationChannel,
} from "./notification-provider.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";

interface IntentRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly template_key: string;
  readonly topic_key: string;
  readonly policy: "required" | "optional";
  readonly requested_channels: NotificationChannel[];
  readonly recipient_user_id: string | null;
  readonly recipient_person_id: string | null;
  readonly recipient_snapshot: Readonly<Record<string, unknown>>;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly correlation_id: string;
}

interface DeliveryRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly notification_intent_id: string;
  readonly channel: NotificationChannel;
  readonly provider_key: string;
  readonly sender_snapshot: Readonly<Record<string, unknown>>;
  readonly recipient_snapshot: Readonly<Record<string, unknown>>;
  readonly content_snapshot: Readonly<Record<string, unknown>>;
  readonly attempts: number;
  readonly correlation_id: string;
}

interface DigestRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly recipient_key: string;
  readonly channel: "email" | "push";
  readonly frequency: "daily" | "weekly";
  readonly recipient_snapshot: Readonly<Record<string, unknown>>;
  readonly item_snapshot: readonly Readonly<Record<string, unknown>>[];
  readonly attempts: number;
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function recipientKey(intent: IntentRow): string {
  return intent.recipient_user_id
    ? `user:${intent.recipient_user_id}`
    : intent.recipient_person_id
      ? `person:${intent.recipient_person_id}`
      : `snapshot:${checksum(intent.recipient_snapshot).slice(0, 32)}`;
}

function resolveVariable(
  variables: Readonly<Record<string, unknown>>,
  path: string,
): string {
  let current: unknown = variables;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return "";
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === null || current === undefined) return "";
  if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return JSON.stringify(current);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render(
  template: string | null,
  variables: Readonly<Record<string, unknown>>,
  html: boolean,
): string | null {
  if (template === null) return null;
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, path: string) => {
    const value = resolveVariable(variables, path);
    return html ? escapeHtml(value) : value;
  });
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

export class NotificationDispatcher {
  constructor(
    private readonly pool: Pool,
    private readonly providers: NotificationProviderRegistry,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly maximumAttempts: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {}

  private async claimIntents(): Promise<readonly IntentRow[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<IntentRow>(
        `WITH candidates AS (
           SELECT id
           FROM notification_intents
           WHERE status = 'pending' AND scheduled_at <= now()
           ORDER BY scheduled_at, created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE notification_intents intent
         SET status = 'processing'
         FROM candidates
         WHERE intent.id = candidates.id
         RETURNING intent.id, intent.tenant_id, intent.template_key, intent.topic_key,
                   intent.policy, intent.requested_channels, intent.recipient_user_id,
                   intent.recipient_person_id, intent.recipient_snapshot,
                   intent.variables, intent.correlation_id`,
        [this.batchSize],
      );
      return result.rows;
    });
  }

  private async preference(
    client: PoolClient,
    intent: IntentRow,
    channel: NotificationChannel,
  ): Promise<{ state: "enabled" | "disabled" | "digest"; frequency?: "daily" | "weekly" }> {
    if (intent.policy === "required") return { state: "enabled" };
    const result = await client.query(
      `SELECT state, digest_frequency
       FROM notification_preferences
       WHERE tenant_id = $1
         AND recipient_user_id IS NOT DISTINCT FROM $2::uuid
         AND recipient_person_id IS NOT DISTINCT FROM $3::uuid
         AND channel = $4
         AND topic_key IN ($5, '*')
       ORDER BY (topic_key = $5) DESC, updated_at DESC
       LIMIT 1`,
      [
        intent.tenant_id,
        intent.recipient_user_id,
        intent.recipient_person_id,
        channel,
        intent.topic_key,
      ],
    );
    const row = result.rows[0];
    if (!row) return { state: "enabled" };
    return {
      state: row.state,
      ...(row.digest_frequency ? { frequency: row.digest_frequency } : {}),
    };
  }

  private async prepareIntent(intent: IntentRow): Promise<void> {
    await transaction(this.pool, async (client) => {
      const template = await client.query(
        `SELECT version.subject_template, version.body_template,
                version.content_type, version.version_number
         FROM notification_templates template
         JOIN notification_template_versions version
           ON version.tenant_id = template.tenant_id
          AND version.template_id = template.id
          AND version.status = 'active'
         WHERE template.tenant_id = $1
           AND template.template_key = $2
           AND template.status = 'active'`,
        [intent.tenant_id, intent.template_key],
      );
      const version = template.rows[0];
      if (!version) {
        await client.query(
          `UPDATE notification_intents
           SET status = 'dead-letter', completed_at = now()
           WHERE id = $1`,
          [intent.id],
        );
        return;
      }

      let immediate = 0;
      let suppressed = 0;
      let digested = 0;
      for (const channel of intent.requested_channels) {
        const preference = await this.preference(client, intent, channel);
        if (preference.state === "disabled") {
          const content = { suppression: "recipient-preference", topicKey: intent.topic_key };
          await client.query(
            `INSERT INTO notification_deliveries (
               tenant_id, notification_intent_id, channel, provider_key,
               sender_snapshot, recipient_snapshot, content_snapshot,
               content_checksum, state
             ) VALUES ($1,$2,$3,'preference', '{}'::jsonb,$4,$5,$6,'suppressed')
             ON CONFLICT (tenant_id, notification_intent_id, channel) DO NOTHING`,
            [
              intent.tenant_id,
              intent.id,
              channel,
              intent.recipient_snapshot,
              content,
              checksum(content),
            ],
          );
          suppressed += 1;
          continue;
        }
        if (
          preference.state === "digest" &&
          preference.frequency &&
          (channel === "email" || channel === "push")
        ) {
          const dueAt = new Date(
            Date.now() + (preference.frequency === "daily" ? 86_400_000 : 604_800_000),
          );
          await client.query(
            `INSERT INTO notification_digest_items (
               tenant_id, notification_intent_id, recipient_key,
               channel, frequency, due_at
             ) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (tenant_id, notification_intent_id, channel) DO NOTHING`,
            [
              intent.tenant_id,
              intent.id,
              recipientKey(intent),
              channel,
              preference.frequency,
              dueAt,
            ],
          );
          digested += 1;
          continue;
        }

        const sender = await client.query(
          `SELECT provider_key, sender_identity, reply_to, configuration
           FROM tenant_sender_configurations
           WHERE tenant_id = $1 AND channel = $2 AND status = 'active'
           ORDER BY verified_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [intent.tenant_id, channel],
        );
        const senderRow = sender.rows[0];
        if (!senderRow && process.env.NODE_ENV === "production") {
          throw new Error(`notification-sender-unavailable:${channel}`);
        }
        const senderSnapshot = senderRow
          ? {
              providerKey: senderRow.provider_key,
              senderIdentity: senderRow.sender_identity,
              replyTo: senderRow.reply_to,
              configuration: senderRow.configuration,
            }
          : { providerKey: "stdout", senderIdentity: "veza-local" };
        const html = version.content_type === "text/html";
        const content = {
          templateKey: intent.template_key,
          templateVersion: Number(version.version_number),
          contentType: version.content_type,
          subject: render(version.subject_template, intent.variables, false),
          body: render(version.body_template, intent.variables, html),
        };
        await client.query(
          `INSERT INTO notification_deliveries (
             tenant_id, notification_intent_id, channel, provider_key,
             sender_snapshot, recipient_snapshot, content_snapshot,
             content_checksum, state
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
           ON CONFLICT (tenant_id, notification_intent_id, channel) DO NOTHING`,
          [
            intent.tenant_id,
            intent.id,
            channel,
            senderSnapshot.providerKey,
            senderSnapshot,
            intent.recipient_snapshot,
            content,
            checksum(content),
          ],
        );
        immediate += 1;
      }
      const status = immediate > 0
        ? "processing"
        : digested > 0
          ? "digested"
          : suppressed > 0
            ? "suppressed"
            : "dead-letter";
      await client.query(
        `UPDATE notification_intents
         SET status = $2,
             completed_at = CASE WHEN $2 IN ('suppressed','dead-letter') THEN now() ELSE NULL END
         WHERE id = $1`,
        [intent.id, status],
      );
    });
  }

  private async claimDeliveries(): Promise<readonly DeliveryRow[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<DeliveryRow>(
        `WITH candidates AS (
           SELECT delivery.id
           FROM notification_deliveries delivery
           WHERE delivery.state IN ('pending','retry')
             AND delivery.next_attempt_at <= now()
             AND (delivery.leased_at IS NULL OR delivery.leased_at < now() - interval '60 seconds')
           ORDER BY delivery.next_attempt_at, delivery.created_at, delivery.id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE notification_deliveries delivery
         SET state = 'processing', attempts = attempts + 1,
             leased_at = now(), lease_owner = $1, updated_at = now()
         FROM candidates, notification_intents intent
         WHERE delivery.id = candidates.id
           AND intent.id = delivery.notification_intent_id
         RETURNING delivery.id, delivery.tenant_id, delivery.notification_intent_id,
                   delivery.channel, delivery.provider_key, delivery.sender_snapshot,
                   delivery.recipient_snapshot, delivery.content_snapshot,
                   delivery.attempts, intent.correlation_id`,
        [this.workerId, this.batchSize],
      );
      return result.rows;
    });
  }

  private async finalizeIntent(intentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notification_intents intent
       SET status = CASE
             WHEN EXISTS (
               SELECT 1 FROM notification_deliveries delivery
               WHERE delivery.notification_intent_id = intent.id
                 AND delivery.state = 'dead-letter'
             ) THEN 'dead-letter'
             ELSE 'completed'
           END,
           completed_at = now()
       WHERE intent.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM notification_deliveries delivery
           WHERE delivery.notification_intent_id = intent.id
             AND delivery.state IN ('pending','processing','retry')
         )`,
      [intentId],
    );
  }

  private async deliver(delivery: DeliveryRow): Promise<boolean> {
    const provider = this.providers.resolve(delivery.provider_key);
    const result = await provider.send({
      deliveryId: delivery.id,
      tenantId: delivery.tenant_id,
      channel: delivery.channel,
      sender: delivery.sender_snapshot,
      recipient: delivery.recipient_snapshot,
      content: delivery.content_snapshot,
      correlationId: delivery.correlation_id,
    });
    if (result.accepted) {
      const updated = await this.pool.query(
        `UPDATE notification_deliveries
         SET state = 'sent', provider_message_id = $4, provider_status = $5,
             sent_at = now(), last_error = NULL, leased_at = NULL,
             lease_owner = NULL, updated_at = now()
         WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND state = 'processing'`,
        [
          delivery.id,
          this.workerId,
          delivery.attempts,
          result.providerMessageId ?? null,
          result.providerStatus ?? "accepted",
        ],
      );
      if (updated.rowCount === 1) await this.finalizeIntent(delivery.notification_intent_id);
      return updated.rowCount === 1;
    }

    const deadLetter = delivery.attempts >= this.maximumAttempts;
    const delaySeconds = retryDelaySeconds(
      delivery.id,
      delivery.attempts,
      this.retryBaseSeconds,
      this.retryMaximumSeconds,
    );
    const updated = await this.pool.query(
      `UPDATE notification_deliveries
       SET state = $4, next_attempt_at = $5, last_error = $6,
           leased_at = NULL, lease_owner = NULL, updated_at = now()
       WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND state = 'processing'`,
      [
        delivery.id,
        this.workerId,
        delivery.attempts,
        deadLetter ? "dead-letter" : "retry",
        nextAttemptAt(new Date(), delaySeconds),
        (result.errorCode ?? "notification-provider-rejected").slice(0, 2_000),
      ],
    );
    if (deadLetter && updated.rowCount === 1) await this.finalizeIntent(delivery.notification_intent_id);
    return false;
  }

  private async claimDigests(): Promise<readonly DigestRow[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<DigestRow>(
        `WITH candidates AS (
           SELECT id FROM notification_digest_batches
           WHERE state IN ('pending','retry') AND next_attempt_at <= now()
           ORDER BY next_attempt_at, created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE notification_digest_batches batch
         SET state = 'processing', attempts = attempts + 1
         FROM candidates
         WHERE batch.id = candidates.id
         RETURNING batch.id, batch.tenant_id, batch.recipient_key,
                   batch.channel, batch.frequency, batch.recipient_snapshot,
                   batch.item_snapshot, batch.attempts`,
        [this.workerId, this.batchSize],
      );
      return result.rows;
    });
  }

  private async deliverDigest(batch: DigestRow): Promise<boolean> {
    const sender = await this.pool.query(
      `SELECT provider_key, sender_identity, reply_to, configuration
       FROM tenant_sender_configurations
       WHERE tenant_id = $1 AND channel = $2 AND status = 'active'
       ORDER BY verified_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [batch.tenant_id, batch.channel],
    );
    const senderRow = sender.rows[0];
    const providerKey = senderRow?.provider_key ?? "stdout";
    const senderSnapshot = senderRow
      ? {
          providerKey,
          senderIdentity: senderRow.sender_identity,
          replyTo: senderRow.reply_to,
          configuration: senderRow.configuration,
        }
      : { providerKey, senderIdentity: "veza-local" };
    try {
      const result = await this.providers.resolve(providerKey).send({
        deliveryId: batch.id,
        tenantId: batch.tenant_id,
        channel: batch.channel,
        sender: senderSnapshot,
        recipient: batch.recipient_snapshot,
        content: {
          contentType: "application/json",
          subject: `Your Veza ${batch.frequency} digest`,
          items: batch.item_snapshot,
        },
        correlationId: `digest-${batch.id}`,
      });
      if (!result.accepted) throw new Error(result.errorCode ?? "digest-provider-rejected");
      await transaction(this.pool, async (client) => {
        await client.query(
          `UPDATE notification_digest_batches
           SET state = 'sent', provider_message_id = $2, sent_at = now(), last_error = NULL
           WHERE id = $1 AND state = 'processing'`,
          [batch.id, result.providerMessageId ?? null],
        );
        await client.query(
          `UPDATE notification_digest_items item
           SET status = 'sent'
           FROM notification_intents intent
           WHERE item.notification_intent_id = intent.id
             AND item.tenant_id = $1
             AND item.recipient_key = $2
             AND item.channel = $3
             AND item.frequency = $4
             AND item.status = 'batched'`,
          [batch.tenant_id, batch.recipient_key, batch.channel, batch.frequency],
        );
      });
      return true;
    } catch (error) {
      const deadLetter = batch.attempts >= this.maximumAttempts;
      const delaySeconds = retryDelaySeconds(
        batch.id,
        batch.attempts,
        this.retryBaseSeconds,
        this.retryMaximumSeconds,
      );
      await this.pool.query(
        `UPDATE notification_digest_batches
         SET state = $2, next_attempt_at = $3, last_error = $4
         WHERE id = $1 AND state = 'processing'`,
        [
          batch.id,
          deadLetter ? "dead-letter" : "retry",
          nextAttemptAt(new Date(), delaySeconds),
          sanitizeDeliveryError(error).slice(0, 2_000),
        ],
      );
      return false;
    }
  }

  async processDue(): Promise<{
    readonly intentsPrepared: number;
    readonly deliveriesProcessed: number;
    readonly deliveriesSent: number;
    readonly digestsProcessed: number;
  }> {
    const intents = await this.claimIntents();
    for (const intent of intents) {
      try {
        await this.prepareIntent(intent);
      } catch (error) {
        await this.pool.query(
          `UPDATE notification_intents
           SET status = 'dead-letter', completed_at = now()
           WHERE id = $1 AND status = 'processing'`,
          [intent.id],
        );
        process.stderr.write(
          `${JSON.stringify({
            level: "error",
            message: "Notification intent preparation failed",
            timestamp: new Date().toISOString(),
            intentId: intent.id,
            tenantId: intent.tenant_id,
            error: sanitizeDeliveryError(error),
          })}\n`,
        );
      }
    }

    const deliveries = await this.claimDeliveries();
    let sent = 0;
    for (const delivery of deliveries) {
      if (await this.deliver(delivery)) sent += 1;
    }
    const digests = await this.claimDigests();
    for (const digest of digests) await this.deliverDigest(digest);
    return {
      intentsPrepared: intents.length,
      deliveriesProcessed: deliveries.length,
      deliveriesSent: sent,
      digestsProcessed: digests.length,
    };
  }
}
