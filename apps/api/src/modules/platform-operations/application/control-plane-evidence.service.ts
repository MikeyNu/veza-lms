import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type {
  TransitionSecurityIncidentDto,
  UpdateTenantHealthDto,
} from "./control-plane-completion.dto.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import {
  canonicalHash,
  operationalReason,
  PlatformOperationExecutor,
  requireVersion,
} from "./release-governance-mutation-support.js";

function correlation(value?: string): string {
  return value?.trim() || "missing-correlation-id";
}

const incidentTransitions: Readonly<Record<string, readonly string[]>> = {
  open: ["contained", "resolved"],
  contained: ["resolved"],
  resolved: ["closed"],
  closed: [],
};

@Injectable()
export class ControlPlaneEvidenceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly executor: PlatformOperationExecutor,
    private readonly audit: PlatformAuditWriter,
  ) {}

  async updateTenantHealth(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    input: UpdateTenantHealthDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      "tenant.health.update",
      "tenant",
      tenantId,
      canonicalHash({ tenantId, ...input, reason }),
      async (client) => {
        const tenant = await client.query(
          `SELECT id FROM tenants WHERE id = $1`,
          [tenantId],
        );
        if (!tenant.rowCount) throw new NotFoundException("Tenant was not found");
        const current = await client.query(
          `SELECT health_status, health_summary, usage_summary, version
           FROM tenant_operational_profiles WHERE tenant_id = $1 FOR UPDATE`,
          [tenantId],
        );
        const profile = current.rows[0];
        if (!profile) throw new NotFoundException("Tenant operational profile was not found");
        requireVersion(input.expectedProfileVersion, profile.version, "Tenant operational profile");
        const updated = await client.query(
          `UPDATE tenant_operational_profiles
           SET health_status = $2,
               health_summary = $3,
               usage_summary = COALESCE($4, usage_summary),
               last_health_check_at = now(),
               version = version + 1,
               updated_by = $5,
               updated_at = now()
           WHERE tenant_id = $1 AND version = $6
           RETURNING health_status, health_summary, usage_summary,
                     last_health_check_at, version`,
          [tenantId, input.healthStatus, input.healthSummary ?? null,
            input.usageSummary ?? null, principal.userId, input.expectedProfileVersion],
        );
        if (!updated.rowCount) throw new ConflictException("Tenant health changed before update completed");
        await this.audit.append(client, {
          eventType: "tenant.health.updated",
          actorId: principal.userId,
          resourceType: "tenant",
          resourceId: tenantId,
          correlationId: correlation(correlationId),
          metadata: {
            reason,
            previousStatus: profile.health_status,
            healthStatus: input.healthStatus,
            healthSummary: input.healthSummary ?? null,
          },
        });
        return {
          tenantId,
          healthStatus: updated.rows[0].health_status,
          healthSummary: updated.rows[0].health_summary,
          usageSummary: updated.rows[0].usage_summary,
          lastHealthCheckAt: updated.rows[0].last_health_check_at.toISOString(),
          version: updated.rows[0].version,
        };
      },
    );
  }

  async transitionSecurityIncident(
    principal: AuthenticatedPrincipal,
    incidentId: string,
    input: TransitionSecurityIncidentDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      `security.incident.${input.state}`,
      "security-incident",
      incidentId,
      canonicalHash({ incidentId, ...input, reason }),
      async (client) => {
        const current = await client.query(
          `SELECT id, tenant_id, state, assigned_to, evidence
           FROM platform_security_incidents WHERE id = $1 FOR UPDATE`,
          [incidentId],
        );
        const incident = current.rows[0];
        if (!incident) throw new NotFoundException("Security incident was not found");
        if (!incidentTransitions[incident.state]?.includes(input.state)) {
          throw new ConflictException(`Security incident cannot move from ${incident.state} to ${input.state}`);
        }
        const updated = await client.query(
          `UPDATE platform_security_incidents
           SET state = $2,
               assigned_to = COALESCE($3, assigned_to),
               evidence = evidence || $4::jsonb,
               contained_at = CASE WHEN $2 = 'contained' THEN now() ELSE contained_at END,
               resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
               closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END
           WHERE id = $1
           RETURNING state, assigned_to, contained_at, resolved_at, closed_at`,
          [incidentId, input.state, input.assignedTo ?? null, input.evidence ?? {}],
        );
        await client.query(
          `INSERT INTO platform_security_incident_events (
             security_incident_id, event_type, from_state, to_state,
             reason, actor_id, correlation_id, evidence
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [incidentId, input.state, incident.state, input.state,
            reason, principal.userId, correlation(correlationId), input.evidence ?? {}],
        );
        await this.audit.append(client, {
          eventType: `security.incident.${input.state}`,
          actorId: principal.userId,
          resourceType: "security-incident",
          resourceId: incidentId,
          correlationId: correlation(correlationId),
          metadata: {
            tenantId: incident.tenant_id,
            previousState: incident.state,
            state: input.state,
            assignedTo: input.assignedTo ?? incident.assigned_to,
            reason,
          },
        });
        return {
          id: incidentId,
          state: updated.rows[0].state,
          assignedTo: updated.rows[0].assigned_to,
          containedAt: updated.rows[0].contained_at?.toISOString(),
          resolvedAt: updated.rows[0].resolved_at?.toISOString(),
          closedAt: updated.rows[0].closed_at?.toISOString(),
        };
      },
    );
  }
}
