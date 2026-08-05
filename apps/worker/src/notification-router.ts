import { createDecipheriv } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  ClaimedConsumerDelivery,
} from "./consumer-repository.js";
import type {
  ConsumerHandler,
  ConsumerHandlerResult,
} from "./consumer-runtime.js";

interface NotificationContract {
  readonly templateKey: string;
  readonly topicKey: string;
  readonly policy: "required" | "optional";
  readonly channels: readonly ("email" | "sms" | "push")[];
  readonly recipientUserId?: string;
  readonly recipientPersonId?: string;
  readonly recipient: Readonly<Record<string, unknown>>;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly deduplicationKey: string;
  readonly institutionId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function invitationToken(encrypted: unknown): string {
  if (!isRecord(encrypted)) throw new Error("invitation-token-envelope-missing");
  if (encrypted.algorithm !== "A256GCM") throw new Error("invitation-token-algorithm-unsupported");
  const encodedKey = process.env.INVITATION_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("invitation-token-encryption-key-unavailable");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("invitation-token-encryption-key-invalid");
  const iv = Buffer.from(String(encrypted.iv ?? ""), "base64url");
  const authTag = Buffer.from(String(encrypted.authTag ?? ""), "base64url");
  const ciphertext = Buffer.from(String(encrypted.ciphertext ?? ""), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
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

function contractFor(delivery: ClaimedConsumerDelivery): NotificationContract {
  const envelope = delivery.envelope;
  const payload = isRecord(envelope.payload) ? envelope.payload : {};
  if (delivery.eventName === "identity.membership-invitation.requested") {
    const email = stringValue(payload, "email");
    const invitationId = stringValue(payload, "invitationId");
    if (!email || !invitationId) throw new Error("invitation-notification-recipient-missing");
    const token = invitationToken(payload.encryptedToken);
    const applicationUrl = (process.env.VEZA_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    return {
      templateKey: "identity.membership-invitation",
      topicKey: "identity.access",
      policy: "required",
      channels: ["email"],
      recipient: { email, locale: "en-ZA", timezone: "Africa/Johannesburg" },
      variables: {
        invitationId,
        roleKey: payload.roleKey,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
        expiresAt: payload.expiresAt,
        invitationUrl: `${applicationUrl}/accept-invitation?id=${encodeURIComponent(invitationId)}&token=${encodeURIComponent(token)}`,
      },
      deduplicationKey: `invitation:${invitationId}:requested:v1`,
    };
  }

  const source = isRecord(payload.notification) ? payload.notification : payload;
  const templateKey = stringValue(source, "templateKey");
  const topicKey = stringValue(source, "topicKey");
  const recipient = isRecord(source.recipient) ? source.recipient : undefined;
  const variables = isRecord(source.variables) ? source.variables : {};
  const channels = stringArray(source.channels).filter(
    (channel): channel is "email" | "sms" | "push" =>
      channel === "email" || channel === "sms" || channel === "push",
  );
  if (!templateKey || !topicKey || !recipient || channels.length === 0) {
    throw new Error("notification-contract-invalid");
  }
  const policy = source.policy === "required" ? "required" : "optional";
  return {
    templateKey,
    topicKey,
    policy,
    channels,
    recipientUserId: stringValue(source, "recipientUserId"),
    recipientPersonId: stringValue(source, "recipientPersonId"),
    recipient,
    variables,
    deduplicationKey:
      stringValue(source, "deduplicationKey") ??
      `${delivery.eventName}:${delivery.outboxEventId}:${delivery.replaySequence}`,
    institutionId: stringValue(source, "institutionId"),
  };
}

async function ensureInvitationTemplate(
  client: PoolClient,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const template = await client.query<{ id: string }>(
    `INSERT INTO notification_templates (
       tenant_id, template_key, display_name, topic_key, policy,
       default_channels, status, created_by
     ) VALUES ($1,'identity.membership-invitation','Membership invitation',
       'identity.access','required',ARRAY['email'],'active',$2)
     ON CONFLICT (tenant_id, template_key)
     DO UPDATE SET updated_at = notification_templates.updated_at
     RETURNING id`,
    [tenantId, actorId],
  );
  await client.query(
    `INSERT INTO notification_template_versions (
       tenant_id, template_id, version_number, subject_template,
       body_template, content_type, variable_schema, status,
       created_by, submitted_by, submitted_at, approved_by, approved_at,
       approval_reason
     ) VALUES (
       $1,$2,1,'You have been invited to Veza',
       'You have been invited to join Veza as {{roleKey}}. Open {{invitationUrl}} before {{expiresAt}}.',
       'text/plain',
       '{"required":["roleKey","invitationUrl","expiresAt"]}'::jsonb,
       'active',$3,$3,now(),$3,now(),'System-required access notification template.'
     )
     ON CONFLICT (tenant_id, template_id, version_number) DO NOTHING`,
    [tenantId, template.rows[0].id, actorId],
  );
}

export class NotificationRouter implements ConsumerHandler {
  constructor(private readonly pool: Pool) {}

  async handle(delivery: ClaimedConsumerDelivery): Promise<ConsumerHandlerResult> {
    const contract = contractFor(delivery);
    const actorId = String(delivery.envelope.actorId ?? "");
    if (!actorId) throw new Error("notification-actor-missing");
    const intentId = await transaction(this.pool, async (client) => {
      if (contract.templateKey === "identity.membership-invitation") {
        await ensureInvitationTemplate(client, delivery.tenantId, actorId);
      }
      const result = await client.query<{ id: string }>(
        `INSERT INTO notification_intents (
           tenant_id, institution_id, template_key, topic_key, policy,
           requested_channels, recipient_user_id, recipient_person_id,
           recipient_snapshot, variables, deduplication_key,
           scheduled_at, status, source_event_id, correlation_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),'pending',$12,$13,$14)
         ON CONFLICT (tenant_id, deduplication_key)
         DO UPDATE SET deduplication_key = notification_intents.deduplication_key
         RETURNING id`,
        [
          delivery.tenantId,
          contract.institutionId ?? null,
          contract.templateKey,
          contract.topicKey,
          contract.policy,
          contract.channels,
          contract.recipientUserId ?? null,
          contract.recipientPersonId ?? null,
          contract.recipient,
          contract.variables,
          contract.deduplicationKey,
          delivery.outboxEventId,
          String(delivery.envelope.correlationId ?? delivery.outboxEventId),
          actorId,
        ],
      );
      return result.rows[0].id;
    });
    return {
      handlerVersion: "communications.notification-router.v1",
      evidence: {
        intentId,
        templateKey: contract.templateKey,
        topicKey: contract.topicKey,
        channels: contract.channels,
        policy: contract.policy,
      },
    };
  }
}
