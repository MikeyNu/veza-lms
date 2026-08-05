import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";
import type {
  ApproveNotificationTemplateDto,
  ConfigureTenantSenderDto,
  CreateNotificationTemplateDto,
  CreateNotificationTemplateVersionDto,
  ProviderEventDto,
  QueueNotificationDto,
  UpdateNotificationPreferenceDto,
  VerifyTenantSenderDto,
  VersionedDecisionDto,
} from "./communications.dto.js";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function normalizeReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function recipientSnapshot(input: QueueNotificationDto): Readonly<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  if (input.email) snapshot.email = input.email.trim().toLowerCase();
  if (input.phone) snapshot.phone = input.phone.replace(/\s+/g, "");
  if (input.pushToken) snapshot.pushToken = input.pushToken;
  if (Object.keys(snapshot).length === 0 && !input.recipientUserId && !input.recipientPersonId) {
    throw new BadRequestException("Notification requires a recipient identity or delivery address");
  }
  return snapshot;
}

async function audit(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  correlationId: string,
  eventType: string,
  resourceType: string,
  resourceId: string,
  evidence: Readonly<Record<string, unknown>>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       tenant_id, plane, event_type, actor_id, resource_type,
       resource_id, purpose, correlation_id, after_state
     ) VALUES ($1,'application',$2,$3,$4,$5,'communications administration',$6,$7)`,
    [tenantId, eventType, actorId, resourceType, resourceId, correlationId, evidence],
  );
}

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async workspace() {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [templates, senders, preferences, deliveries, suppressions] = await Promise.all([
        client.query(
          `SELECT template.id, template.template_key, template.display_name,
                  template.topic_key, template.policy, template.default_channels,
                  template.status, version.id active_version_id,
                  version.version_number active_version_number,
                  version.content_type, template.updated_at
           FROM notification_templates template
           LEFT JOIN notification_template_versions version
             ON version.tenant_id = template.tenant_id
            AND version.template_id = template.id
            AND version.status = 'active'
           ORDER BY template.display_name`,
        ),
        client.query(
          `SELECT id, channel, provider_key, sender_identity, reply_to,
                  status, version, verified_at, updated_at
           FROM tenant_sender_configurations
           ORDER BY channel, created_at DESC`,
        ),
        client.query(
          `SELECT id, topic_key, channel, state, digest_frequency,
                  quiet_hours, version, updated_at
           FROM notification_preferences
           WHERE recipient_user_id = $1
           ORDER BY topic_key, channel`,
          [context.actorId],
        ),
        client.query(
          `SELECT delivery.id, intent.template_key, intent.topic_key,
                  delivery.channel, delivery.provider_key, delivery.state,
                  delivery.attempts, delivery.provider_status,
                  delivery.sent_at, delivery.delivered_at, delivery.updated_at,
                  CASE WHEN delivery.last_error IS NULL THEN NULL
                       ELSE left(delivery.last_error, 160) END last_error
           FROM notification_deliveries delivery
           JOIN notification_intents intent
             ON intent.tenant_id = delivery.tenant_id
            AND intent.id = delivery.notification_intent_id
           ORDER BY delivery.updated_at DESC
           LIMIT 50`,
        ),
        client.query(
          `SELECT channel, reason, provider_key, created_at, expires_at
           FROM notification_recipient_suppressions
           WHERE status = 'active'
           ORDER BY created_at DESC
           LIMIT 25`,
        ),
      ]);
      return {
        tenantId: context.tenantId,
        generatedAt: new Date().toISOString(),
        templates: templates.rows,
        senders: senders.rows,
        preferences: preferences.rows,
        recentDeliveries: deliveries.rows,
        activeSuppressions: suppressions.rows,
      };
    });
  }

  async createTemplate(input: CreateNotificationTemplateDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const template = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO notification_templates (
           tenant_id, template_key, display_name, topic_key, policy,
           default_channels, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [
          context.tenantId,
          input.templateKey,
          input.displayName.trim(),
          input.topicKey,
          input.policy,
          input.defaultChannels,
          context.actorId,
        ],
      );
      const version = await client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO notification_template_versions (
           tenant_id, template_id, version_number, subject_template,
           body_template, content_type, variable_schema, created_by
         ) VALUES ($1,$2,1,$3,$4,$5,$6,$7)
         RETURNING id, version`,
        [
          context.tenantId,
          template.rows[0].id,
          input.subjectTemplate ?? null,
          input.bodyTemplate,
          input.contentType,
          input.variableSchema,
          context.actorId,
        ],
      );
      await audit(
        client,
        context.tenantId,
        context.actorId,
        context.correlationId,
        "communications.template.created",
        "notification-template",
        template.rows[0].id,
        {
          templateKey: input.templateKey,
          topicKey: input.topicKey,
          policy: input.policy,
          channels: input.defaultChannels,
          versionId: version.rows[0].id,
        },
      );
      return {
        id: template.rows[0].id,
        versionId: version.rows[0].id,
        versionNumber: 1,
        status: "draft",
        version: version.rows[0].version,
      };
    });
  }

  async createTemplateVersion(templateId: string, input: CreateNotificationTemplateVersionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const template = await client.query(
        `SELECT id FROM notification_templates
         WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [templateId],
      );
      if (!template.rowCount) throw new NotFoundException("Notification template was not found");
      const next = await client.query<{ next_version: number } & QueryResultRow>(
        `SELECT COALESCE(max(version_number),0)+1 next_version
         FROM notification_template_versions WHERE template_id = $1`,
        [templateId],
      );
      const result = await client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO notification_template_versions (
           tenant_id, template_id, version_number, subject_template,
           body_template, content_type, variable_schema, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, version`,
        [
          context.tenantId,
          templateId,
          Number(next.rows[0].next_version),
          input.subjectTemplate ?? null,
          input.bodyTemplate,
          input.contentType,
          input.variableSchema,
          context.actorId,
        ],
      );
      return {
        id: result.rows[0].id,
        versionNumber: Number(next.rows[0].next_version),
        status: "draft",
        version: result.rows[0].version,
      };
    });
  }

  async submitTemplateVersion(versionId: string, input: VersionedDecisionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const updated = await client.query(
        `UPDATE notification_template_versions
         SET status = 'in_review', submitted_by = $3, submitted_at = now(),
             version = version + 1
         WHERE id = $1 AND version = $2 AND status = 'draft'
         RETURNING version`,
        [versionId, input.expectedVersion, context.actorId],
      );
      if (!updated.rowCount) throw new ConflictException("Template version is stale or not a draft");
      return { id: versionId, status: "in_review", version: updated.rows[0].version };
    });
  }

  async approveTemplateVersion(versionId: string, input: ApproveNotificationTemplateDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const current = await client.query(
        `SELECT template_id, created_by, submitted_by, version, status
         FROM notification_template_versions WHERE id = $1 FOR UPDATE`,
        [versionId],
      );
      const row = current.rows[0];
      if (!row) throw new NotFoundException("Notification template version was not found");
      if (row.status !== "in_review" || row.version !== input.expectedVersion) {
        throw new ConflictException("Template version is stale or not awaiting approval");
      }
      if (row.created_by === context.actorId || row.submitted_by === context.actorId) {
        throw new ConflictException("Template activation requires an independent approver");
      }
      await client.query(
        `UPDATE notification_template_versions
         SET status = 'retired', version = version + 1
         WHERE template_id = $1 AND status = 'active'`,
        [row.template_id],
      );
      const updated = await client.query(
        `UPDATE notification_template_versions
         SET status = 'active', approved_by = $2, approved_at = now(),
             approval_reason = $3, version = version + 1
         WHERE id = $1 RETURNING version`,
        [versionId, context.actorId, normalizeReason(input.reason)],
      );
      await audit(
        client,
        context.tenantId,
        context.actorId,
        context.correlationId,
        "communications.template-version.activated",
        "notification-template-version",
        versionId,
        { reason: normalizeReason(input.reason), templateId: row.template_id },
      );
      return { id: versionId, status: "active", version: updated.rows[0].version };
    });
  }

  async configureSender(input: ConfigureTenantSenderDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO tenant_sender_configurations (
           tenant_id, channel, provider_key, sender_identity, reply_to,
           secret_reference, configuration, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, version`,
        [
          context.tenantId,
          input.channel,
          input.providerKey,
          input.senderIdentity.trim(),
          input.replyTo ?? null,
          input.secretReference,
          input.configuration,
          context.actorId,
        ],
      );
      await audit(
        client,
        context.tenantId,
        context.actorId,
        context.correlationId,
        "communications.sender.created",
        "tenant-sender-configuration",
        result.rows[0].id,
        {
          channel: input.channel,
          providerKey: input.providerKey,
          senderIdentity: input.senderIdentity,
          secretReference: input.secretReference,
        },
      );
      return { id: result.rows[0].id, status: "pending-verification", version: result.rows[0].version };
    });
  }

  async verifySender(senderId: string, input: VerifyTenantSenderDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const current = await client.query(
        `SELECT channel, created_by, version, status
         FROM tenant_sender_configurations WHERE id = $1 FOR UPDATE`,
        [senderId],
      );
      const sender = current.rows[0];
      if (!sender) throw new NotFoundException("Tenant sender configuration was not found");
      if (sender.status !== "pending-verification" || sender.version !== input.expectedVersion) {
        throw new ConflictException("Tenant sender configuration is stale or unavailable");
      }
      if (sender.created_by === context.actorId) {
        throw new ConflictException("Sender verification requires an independent operator");
      }
      await client.query(
        `UPDATE tenant_sender_configurations
         SET status = 'suspended', version = version + 1, updated_at = now()
         WHERE channel = $1 AND status = 'active'`,
        [sender.channel],
      );
      const updated = await client.query(
        `UPDATE tenant_sender_configurations
         SET status = 'active', verified_by = $2, verified_at = now(),
             version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`,
        [senderId, context.actorId],
      );
      await audit(
        client,
        context.tenantId,
        context.actorId,
        context.correlationId,
        "communications.sender.verified",
        "tenant-sender-configuration",
        senderId,
        { channel: sender.channel, reason: normalizeReason(input.reason) },
      );
      return { id: senderId, status: "active", version: updated.rows[0].version };
    });
  }

  async updatePreference(input: UpdateNotificationPreferenceDto) {
    const context = this.context.require();
    if ((input.state === "digest") !== Boolean(input.digestFrequency)) {
      throw new BadRequestException("Digest preferences require a daily or weekly frequency");
    }
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query(
        `INSERT INTO notification_preferences (
           tenant_id, recipient_user_id, topic_key, channel, state,
           digest_frequency, quiet_hours, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$2)
         ON CONFLICT (
           tenant_id, recipient_user_id, recipient_person_id, topic_key, channel
         )
         DO UPDATE SET state = EXCLUDED.state,
                       digest_frequency = EXCLUDED.digest_frequency,
                       quiet_hours = EXCLUDED.quiet_hours,
                       version = notification_preferences.version + 1,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()
         RETURNING id, version`,
        [
          context.tenantId,
          context.actorId,
          input.topicKey,
          input.channel,
          input.state,
          input.digestFrequency ?? null,
          input.quietHours,
        ],
      ),
    );
    return {
      id: result.rows[0].id,
      topicKey: input.topicKey,
      channel: input.channel,
      state: input.state,
      version: result.rows[0].version,
    };
  }

  async queue(input: QueueNotificationDto) {
    const context = this.context.require();
    if (Boolean(input.recipientUserId) && Boolean(input.recipientPersonId)) {
      throw new BadRequestException("Notification recipient must be either a user or person");
    }
    const snapshot = recipientSnapshot(input);
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const template = await client.query(
        `SELECT template_key FROM notification_templates
         WHERE template_key = $1 AND status = 'active'`,
        [input.templateKey],
      );
      if (!template.rowCount) throw new NotFoundException("Active notification template was not found");
      const result = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO notification_intents (
           tenant_id, institution_id, template_key, topic_key, policy,
           requested_channels, recipient_user_id, recipient_person_id,
           recipient_snapshot, variables, deduplication_key,
           scheduled_at, correlation_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (tenant_id, deduplication_key)
         DO UPDATE SET deduplication_key = notification_intents.deduplication_key
         RETURNING id`,
        [
          context.tenantId,
          input.institutionId ?? null,
          input.templateKey,
          input.topicKey,
          input.policy,
          input.channels,
          input.recipientUserId ?? null,
          input.recipientPersonId ?? null,
          snapshot,
          input.variables,
          input.deduplicationKey,
          input.scheduledAt ?? new Date().toISOString(),
          context.correlationId,
          context.actorId,
        ],
      );
      return { id: result.rows[0].id, status: "pending" };
    });
  }

  async applyProviderEvent(
    input: ProviderEventDto,
    timestamp: string,
    signature: string,
  ) {
    this.verifyProviderSignature(input, timestamp, signature);
    const eventChecksum = hash(input.evidence);
    return this.database.withTenantTransaction(input.tenantId, async (client) => {
      const result = await client.query<{ provider_event_id: string } & QueryResultRow>(
        `SELECT app.apply_notification_provider_event(
           $1,$2,$3,$4,$5,$6,$7,$8,$9
         ) provider_event_id`,
        [
          input.tenantId,
          input.providerKey,
          input.providerEventId,
          input.providerMessageId,
          input.eventType,
          input.recipientHash ?? null,
          eventChecksum,
          input.evidence,
          input.occurredAt,
        ],
      );
      return { id: result.rows[0].provider_event_id, status: "accepted" };
    });
  }

  async supportDiagnostics() {
    const result = await this.database.controlPlaneQuery(
      `SELECT tenant_id,
              count(*) FILTER (WHERE state IN ('pending','processing','retry')) pending,
              count(*) FILTER (WHERE state = 'dead-letter') dead_letter,
              count(*) FILTER (WHERE state = 'bounced') bounced,
              count(*) FILTER (WHERE state = 'complained') complained,
              min(created_at) FILTER (WHERE state IN ('pending','processing','retry')) oldest_pending_at,
              max(updated_at) last_activity_at
       FROM notification_deliveries
       GROUP BY tenant_id
       ORDER BY dead_letter DESC, pending DESC, tenant_id
       LIMIT 500`,
    );
    return {
      generatedAt: new Date().toISOString(),
      tenants: result.rows.map((row) => ({
        tenantId: row.tenant_id,
        pending: Number(row.pending),
        deadLetter: Number(row.dead_letter),
        bounced: Number(row.bounced),
        complained: Number(row.complained),
        oldestPendingAt: row.oldest_pending_at,
        lastActivityAt: row.last_activity_at,
      })),
    };
  }

  private verifyProviderSignature(
    input: ProviderEventDto,
    timestamp: string,
    signature: string,
  ): void {
    const occurred = Number(timestamp);
    if (!Number.isFinite(occurred) || Math.abs(Date.now() - occurred * 1000) > 300_000) {
      throw new ForbiddenException("Provider event timestamp is outside the replay window");
    }
    const envKey = input.providerKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const secret = process.env[`NOTIFICATION_WEBHOOK_SECRET_${envKey}`];
    if (!secret) throw new ForbiddenException("Provider event verification is not configured");
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${JSON.stringify(input)}`, "utf8")
      .digest("hex");
    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException("Provider event signature is invalid");
    }
  }
}
