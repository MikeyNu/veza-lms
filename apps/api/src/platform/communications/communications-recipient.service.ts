import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";

interface RecipientPreferenceRow extends QueryResultRow {
  readonly id: string;
  readonly topic_key: string;
  readonly channel: string;
  readonly state: string;
  readonly digest_frequency: string | null;
  readonly quiet_hours: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly updated_at: string;
}

interface RecipientNotificationRow extends QueryResultRow {
  readonly id: string;
  readonly template_key: string;
  readonly topic_key: string;
  readonly policy: string;
  readonly requested_channels: readonly string[];
  readonly status: string;
  readonly scheduled_at: string;
  readonly created_at: string;
  readonly completed_at: string | null;
  readonly channel: string | null;
  readonly delivery_state: string | null;
  readonly content_snapshot: Readonly<Record<string, unknown>> | null;
  readonly activity_at: string;
}

@Injectable()
export class CommunicationsRecipientService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async workspace() {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [preferences, notifications] = await Promise.all([
        client.query<RecipientPreferenceRow>(
          `SELECT id, topic_key, channel, state, digest_frequency,
                  quiet_hours, version, updated_at
           FROM notification_preferences
           WHERE recipient_user_id = $1
           ORDER BY topic_key, channel`,
          [context.actorId],
        ),
        client.query<RecipientNotificationRow>(
          `SELECT intent.id, intent.template_key, intent.topic_key, intent.policy,
                  intent.requested_channels, intent.status, intent.scheduled_at,
                  intent.created_at, intent.completed_at,
                  delivery.channel, delivery.state delivery_state,
                  delivery.content_snapshot,
                  COALESCE(
                    delivery.delivered_at,
                    delivery.sent_at,
                    delivery.updated_at,
                    intent.completed_at,
                    intent.created_at
                  ) activity_at
           FROM notification_intents intent
           LEFT JOIN LATERAL (
             SELECT candidate.channel, candidate.state, candidate.content_snapshot,
                    candidate.delivered_at, candidate.sent_at, candidate.updated_at
             FROM notification_deliveries candidate
             WHERE candidate.tenant_id = intent.tenant_id
               AND candidate.notification_intent_id = intent.id
             ORDER BY candidate.updated_at DESC, candidate.id DESC
             LIMIT 1
           ) delivery ON true
           WHERE intent.recipient_user_id = $1
              OR EXISTS (
                SELECT 1
                FROM people person
                WHERE person.tenant_id = intent.tenant_id
                  AND person.id = intent.recipient_person_id
                  AND person.linked_user_id = $1
              )
           ORDER BY intent.created_at DESC, intent.id DESC
           LIMIT 50`,
          [context.actorId],
        ),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        preferences: preferences.rows,
        notifications: notifications.rows,
      };
    });
  }
}
