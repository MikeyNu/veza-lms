import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import type {
  CreateAlertRuleDto,
  CreateSloDefinitionDto,
  UpdateAlertEventStateDto,
  UpdateAlertRuleStatusDto,
  UpdateErrorReportStateDto,
  UpdateRuntimeStatusDto,
  UpdateSloStatusDto,
} from "./observability-operations.dto.js";

interface ActorEvidence {
  readonly actorId: string;
  readonly correlationId: string;
}

function reason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function camel(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

@Injectable()
export class ObservabilityOperationsService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    const [heartbeats, sloDefinitions, sloMeasurements, alertRules, alertEvents, errors, backlog] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT runtime_key, runtime_type, environment, release_version,
                instance_id, status, capabilities, metadata, started_at,
                last_seen_at, updated_at,
                EXTRACT(EPOCH FROM (now()-last_seen_at))::integer age_seconds
         FROM platform_runtime_heartbeats
         ORDER BY runtime_type, runtime_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT id, service_name, slo_key, display_name, indicator_type,
                objective, window_days, latency_threshold_ms,
                query_definition, status, created_by, created_at
         FROM slo_definitions
         ORDER BY status = 'active' DESC, service_name, slo_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT DISTINCT ON (measurement.slo_definition_id)
                measurement.slo_definition_id, measurement.measured_at,
                measurement.window_started_at, measurement.window_ended_at,
                measurement.total_events, measurement.good_events,
                measurement.achieved, measurement.error_budget_remaining,
                measurement.burn_rate_1h, measurement.burn_rate_6h,
                measurement.evidence
         FROM slo_measurements measurement
         ORDER BY measurement.slo_definition_id, measurement.measured_at DESC`,
      ),
      this.database.controlPlaneQuery(
        `SELECT id, alert_key, display_name, severity, condition_type,
                condition, notification_topic, status, created_by, created_at
         FROM alert_rules
         ORDER BY status = 'active' DESC,
                  CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                  alert_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT event.id, event.alert_rule_id, rule.alert_key,
                rule.display_name, rule.severity, event.state,
                event.summary, event.evidence, event.fingerprint,
                event.fired_at, event.acknowledged_by,
                event.acknowledged_at, event.resolved_at
         FROM alert_events event
         JOIN alert_rules rule ON rule.id = event.alert_rule_id
         ORDER BY event.state = 'firing' DESC,
                  CASE rule.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                  event.fired_at DESC
         LIMIT 200`,
      ),
      this.database.controlPlaneQuery(
        `SELECT id, service_name, environment, release_version,
                error_class, error_fingerprint, message_summary,
                route_template, correlation_id, trace_id,
                occurrence_count, first_seen_at, last_seen_at,
                state, metadata
         FROM platform_error_reports
         ORDER BY state = 'open' DESC, last_seen_at DESC
         LIMIT 200`,
      ),
      this.database.controlPlaneQuery(
        `SELECT
           (SELECT count(*) FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL) outbox_backlog,
           (SELECT count(*) FROM outbox_events WHERE dead_lettered_at IS NOT NULL) outbox_dead_letters,
           (SELECT count(*) FROM event_consumer_inbox WHERE state IN ('pending','retry','processing')) consumer_lag,
           (SELECT count(*) FROM notification_deliveries WHERE state IN ('pending','retry','processing')) notification_backlog,
           (SELECT count(*) FROM media_processing_jobs WHERE state IN ('pending','retry','processing')) media_backlog,
           (SELECT count(*) FROM search_index_operations WHERE state IN ('pending','retry','processing')) search_backlog`,
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      heartbeats: heartbeats.rows.map(camel),
      sloDefinitions: sloDefinitions.rows.map(camel),
      sloMeasurements: sloMeasurements.rows.map(camel),
      alertRules: alertRules.rows.map(camel),
      alertEvents: alertEvents.rows.map(camel),
      errors: errors.rows.map(camel),
      backlog: camel(backlog.rows[0] ?? {}),
    };
  }

  async createSlo(input: CreateSloDefinitionDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO slo_definitions (
           service_name, slo_key, display_name, indicator_type,
           objective, window_days, latency_threshold_ms,
           query_definition, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, status, created_at`,
        [
          input.serviceName,
          input.sloKey,
          input.displayName.trim(),
          input.indicatorType,
          input.objective,
          input.windowDays,
          input.latencyThresholdMs ?? null,
          input.queryDefinition,
          actor.actorId,
        ],
      ).catch((error: unknown) => {
        if ((error as { code?: string }).code === "23505") {
          throw new ConflictException("An SLO with this service and key already exists");
        }
        throw error;
      });
      const row = result.rows[0];
      await this.audit(client, actor, "observability.slo.created", "slo-definition", row.id, input);
      return { id: row.id, status: row.status, createdAt: row.created_at.toISOString() };
    });
  }

  async updateSloStatus(id: string, input: UpdateSloStatusDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `UPDATE slo_definitions SET status = $2 WHERE id = $1 RETURNING status`,
        [id, input.status],
      );
      if (!result.rowCount) throw new NotFoundException("SLO definition was not found");
      await this.audit(client, actor, "observability.slo.status-changed", "slo-definition", id, {
        status: input.status,
        reason: reason(input.reason),
      });
      return { id, status: result.rows[0].status };
    });
  }

  async createAlertRule(input: CreateAlertRuleDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO alert_rules (
           alert_key, display_name, severity, condition_type,
           condition, notification_topic, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, status, created_at`,
        [
          input.alertKey,
          input.displayName.trim(),
          input.severity,
          input.conditionType,
          input.condition,
          input.notificationTopic,
          actor.actorId,
        ],
      ).catch((error: unknown) => {
        if ((error as { code?: string }).code === "23505") {
          throw new ConflictException("An alert rule with this key already exists");
        }
        throw error;
      });
      const row = result.rows[0];
      await this.audit(client, actor, "observability.alert-rule.created", "alert-rule", row.id, input);
      return { id: row.id, status: row.status, createdAt: row.created_at.toISOString() };
    });
  }

  async updateAlertRuleStatus(id: string, input: UpdateAlertRuleStatusDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `UPDATE alert_rules SET status = $2 WHERE id = $1 RETURNING status`,
        [id, input.status],
      );
      if (!result.rowCount) throw new NotFoundException("Alert rule was not found");
      await this.audit(client, actor, "observability.alert-rule.status-changed", "alert-rule", id, {
        status: input.status,
        reason: reason(input.reason),
      });
      return { id, status: result.rows[0].status };
    });
  }

  async updateAlertEvent(id: string, input: UpdateAlertEventStateDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `UPDATE alert_events
         SET state = $2,
             acknowledged_by = CASE WHEN $2 = 'acknowledged' THEN $3 ELSE acknowledged_by END,
             acknowledged_at = CASE WHEN $2 = 'acknowledged' THEN now() ELSE acknowledged_at END,
             resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
             evidence = evidence || jsonb_build_object(
               'operatorReason',$4,'operatorId',$3,'operatorUpdatedAt',now()
             )
         WHERE id = $1 AND state <> 'resolved'
         RETURNING state, acknowledged_at, resolved_at`,
        [id, input.state, actor.actorId, reason(input.reason)],
      );
      if (!result.rowCount) throw new NotFoundException("Active alert event was not found");
      await this.audit(client, actor, `observability.alert.${input.state}`, "alert-event", id, {
        reason: reason(input.reason),
      });
      return camel({ id, ...result.rows[0] });
    });
  }

  async updateErrorReport(id: string, input: UpdateErrorReportStateDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `UPDATE platform_error_reports
         SET state = $2,
             metadata = metadata || jsonb_build_object(
               'operatorReason',$3,'operatorId',$4,'operatorUpdatedAt',now()
             )
         WHERE id = $1
         RETURNING state`,
        [id, input.state, reason(input.reason), actor.actorId],
      );
      if (!result.rowCount) throw new NotFoundException("Error report was not found");
      await this.audit(client, actor, `observability.error.${input.state}`, "error-report", id, {
        reason: reason(input.reason),
      });
      return { id, state: result.rows[0].state };
    });
  }

  async updateRuntime(runtimeKey: string, input: UpdateRuntimeStatusDto, actor: ActorEvidence) {
    return this.database.withControlPlaneTransaction(async (client) => {
      const result = await client.query(
        `UPDATE platform_runtime_heartbeats
         SET status = $2,
             metadata = metadata || jsonb_build_object(
               'operatorReason',$3,'operatorId',$4,'operatorUpdatedAt',now()
             ),
             updated_at = now()
         WHERE runtime_key = $1
         RETURNING status, updated_at`,
        [runtimeKey, input.status, reason(input.reason), actor.actorId],
      );
      if (!result.rowCount) throw new NotFoundException("Runtime heartbeat was not found");
      await this.audit(client, actor, "observability.runtime.status-changed", "runtime-heartbeat", runtimeKey, {
        status: input.status,
        reason: reason(input.reason),
      });
      return { id: runtimeKey, status: result.rows[0].status, updatedAt: result.rows[0].updated_at.toISOString() };
    });
  }

  private async audit(
    client: { query: (text: string, values?: readonly unknown[]) => Promise<unknown> },
    actor: ActorEvidence,
    eventType: string,
    resourceType: string,
    resourceId: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO platform_audit_events (
         event_type, actor_id, resource_type, resource_id,
         correlation_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [eventType, actor.actorId, resourceType, resourceId, actor.correlationId, metadata],
    );
  }
}
