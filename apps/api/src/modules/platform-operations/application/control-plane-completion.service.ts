import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import {
  canonicalHash,
  operationalReason,
  PlatformOperationExecutor,
  requireVersion,
} from "./release-governance-mutation-support.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import type {
  CancelTenantDeletionDto,
  ChangeTenantLifecycleDto,
  CompleteTenantExportDto,
  CreateRetentionHoldDto,
  CreateSupportCaseDto,
  RecordCustomerApprovalDto,
  RecordSecurityIncidentDto,
  ReleaseRetentionHoldDto,
  RequestTenantExportDto,
  ResolveSupportCaseDto,
  ScheduleTenantDeletionDto,
  SetBillingLinkDto,
  SetEntitlementOverrideDto,
  SetUsageThresholdDto,
  StartSupportElevationDto,
  TerminateSupportSessionDto,
  UpdateTenantOperationsDto,
} from "./control-plane-completion.dto.js";

type Row = QueryResultRow & Record<string, unknown>;

function camel(row: Row): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

function rows(result: { rows: Row[] }): readonly Record<string, unknown>[] {
  return result.rows.map(camel);
}

function key(prefix: "SUP" | "SEC"): string {
  return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function principalCorrelation(correlationId?: string): string {
  return correlationId?.trim() || "missing-correlation-id";
}

const lifecycleTargets: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  provisioning: { activate: "active" },
  active: { suspend: "suspended", "start-offboarding": "offboarding" },
  suspended: { resume: "active", "start-offboarding": "offboarding" },
  offboarding: { close: "closed" },
  closed: {},
};

@Injectable()
export class ControlPlaneCompletionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly executor: PlatformOperationExecutor,
    private readonly audit: PlatformAuditWriter,
  ) {}

  async operationsOverview() {
    const [tenants, support, incidents, sessions, denials] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT status, count(*)::integer count
         FROM tenants GROUP BY status ORDER BY status`,
      ),
      this.database.controlPlaneQuery(
        `SELECT state, count(*)::integer count
         FROM support_cases GROUP BY state ORDER BY state`,
      ),
      this.database.controlPlaneQuery(
        `SELECT severity, count(*)::integer count
         FROM platform_security_incidents
         WHERE state <> 'closed' GROUP BY severity ORDER BY severity`,
      ),
      this.database.controlPlaneQuery(
        `SELECT count(*)::integer active_sessions,
                count(*) FILTER (WHERE expires_at <= now() + interval '30 minutes')::integer expiring_sessions
         FROM support_elevation_sessions WHERE state = 'active' AND expires_at > now()`,
      ),
      this.database.controlPlaneQuery(
        `SELECT count(*)::integer denials_24h
         FROM entitlement_denial_diagnostics WHERE denied_at >= now() - interval '24 hours'`,
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      tenants: rows(tenants),
      supportCases: rows(support),
      securityIncidents: rows(incidents),
      sessions: camel(sessions.rows[0] ?? {}),
      entitlementDiagnostics: camel(denials.rows[0] ?? {}),
    };
  }

  async tenantDetail(tenantId: string) {
    const tenant = await this.database.controlPlaneQuery(
      `SELECT tenant.id, tenant.slug, tenant.display_name, tenant.legal_name,
              tenant.status, tenant.deployment_tier, tenant.residency_region,
              tenant.plan_key, plan.display_name plan_display_name,
              tenant.locale, tenant.timezone, tenant.custom_domain,
              tenant.branding_status, tenant.identity_provider_status,
              tenant.branding, tenant.identity_config, tenant.retention_policy,
              tenant.operational_version, tenant.created_at, tenant.updated_at,
              profile.health_status, profile.health_summary, profile.quota_policy,
              profile.usage_summary, profile.support_contacts,
              profile.commercial_metadata, profile.last_health_check_at,
              profile.version profile_version
       FROM tenants tenant
       JOIN plans plan ON plan.key = tenant.plan_key
       LEFT JOIN tenant_operational_profiles profile ON profile.tenant_id = tenant.id
       WHERE tenant.id = $1`,
      [tenantId],
    );
    if (!tenant.rows[0]) throw new NotFoundException("Tenant was not found");
    const [lifecycle, exports, holds, deletions, usage, thresholds, entitlements, history, denials, billing, release, support, sessions, incidents] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT id, transition, from_status, to_status, reason, effective_at,
                actor_id, correlation_id, evidence, occurred_at
         FROM tenant_lifecycle_events WHERE tenant_id = $1
         ORDER BY occurred_at DESC, id DESC LIMIT 100`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, export_type, status, storage_reference, checksum_sha256,
                requested_by, requested_at, completed_at, expires_at, metadata, correlation_id
         FROM tenant_export_receipts WHERE tenant_id = $1
         ORDER BY requested_at DESC, id DESC LIMIT 50`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, hold_type, reason, status, reference, starts_at, expires_at,
                released_at, created_by, released_by, correlation_id, created_at
         FROM tenant_retention_holds WHERE tenant_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 50`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, scheduled_for, state, reason, export_receipt_id, created_by,
                cancelled_by, completed_at, correlation_id, metadata, created_at, updated_at
         FROM tenant_deletion_schedules WHERE tenant_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 25`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT period_start, period_end, active_learners, active_staff, storage_bytes,
                api_requests, media_minutes, custom_metrics, captured_at, source
         FROM tenant_usage_snapshots WHERE tenant_id = $1
         ORDER BY period_end DESC LIMIT 24`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, metric_key, warning_value, critical_value, enforcement,
                effective_from, effective_until, reason, created_at
         FROM tenant_usage_thresholds WHERE tenant_id = $1
         ORDER BY effective_from DESC LIMIT 100`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT entitlement.module_key, entitlement.state, entitlement.limits,
                entitlement.valid_from, entitlement.valid_until,
                override.id override_id, override.state override_state,
                override.limits override_limits, override.effective_from override_effective_from,
                override.effective_until override_effective_until, override.reason override_reason
         FROM tenant_entitlements entitlement
         LEFT JOIN LATERAL (
           SELECT * FROM tenant_entitlement_overrides item
           WHERE item.tenant_id = entitlement.tenant_id
             AND item.module_key = entitlement.module_key
             AND item.effective_from <= now()
             AND (item.effective_until IS NULL OR item.effective_until > now())
           ORDER BY item.effective_from DESC LIMIT 1
         ) override ON true
         WHERE entitlement.tenant_id = $1 ORDER BY entitlement.module_key`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, module_key, source, previous_state, resulting_state, reason,
                effective_at, actor_id, correlation_id, occurred_at
         FROM tenant_entitlement_history WHERE tenant_id = $1
         ORDER BY occurred_at DESC, id DESC LIMIT 100`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, module_key, capability_key, denial_code, reason_summary,
                request_context, correlation_id, actor_id, denied_at
         FROM entitlement_denial_diagnostics WHERE tenant_id = $1
         ORDER BY denied_at DESC, id DESC LIMIT 100`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, provider_key, external_customer_reference,
                external_subscription_reference, billing_state, effective_from,
                effective_until, metadata, created_at
         FROM tenant_billing_links WHERE tenant_id = $1
         ORDER BY effective_from DESC LIMIT 25`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT assignment.ring_key, ring.display_name, ring.target_version,
                assignment.effective_from, assignment.effective_until,
                exception.pinned_version, exception.reason exception_reason,
                exception.effective_from exception_effective_from,
                exception.effective_until exception_effective_until
         FROM release_ring_tenants assignment
         JOIN release_rings ring ON ring.ring_key = assignment.ring_key
         LEFT JOIN LATERAL (
           SELECT * FROM tenant_release_exceptions item
           WHERE item.tenant_id = assignment.tenant_id
             AND item.effective_from <= now()
             AND (item.effective_until IS NULL OR item.effective_until > now())
           ORDER BY item.effective_from DESC LIMIT 1
         ) exception ON true
         WHERE assignment.tenant_id = $1
         ORDER BY assignment.effective_from DESC LIMIT 20`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, case_key, title, purpose, requested_scope, state, severity,
                customer_contact, created_by, created_at, resolved_at, version, correlation_id
         FROM support_cases WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT 50`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT session.id, case_record.case_key, session.operator_id,
                session.granted_scope, session.state, session.started_at,
                session.expires_at, session.terminated_at,
                session.termination_reason, session.assisted_session_indicator
         FROM support_elevation_sessions session
         JOIN support_cases case_record ON case_record.id = session.support_case_id
         WHERE session.tenant_id = $1 ORDER BY session.started_at DESC LIMIT 50`, [tenantId]),
      this.database.controlPlaneQuery(
        `SELECT id, incident_key, severity, category, summary, state, evidence,
                reported_by, assigned_to, reported_at, contained_at, resolved_at, closed_at
         FROM platform_security_incidents WHERE tenant_id = $1
         ORDER BY reported_at DESC LIMIT 50`, [tenantId]),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      tenant: camel(tenant.rows[0]),
      lifecycle: rows(lifecycle),
      exportReceipts: rows(exports),
      retentionHolds: rows(holds),
      deletionSchedules: rows(deletions),
      usage: rows(usage),
      usageThresholds: rows(thresholds),
      entitlements: rows(entitlements),
      entitlementHistory: rows(history),
      entitlementDenials: rows(denials),
      billingLinks: rows(billing),
      release: rows(release),
      supportCases: rows(support),
      supportSessions: rows(sessions),
      securityIncidents: rows(incidents),
    };
  }

  async updateTenantOperations(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    input: UpdateTenantOperationsDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.operations.update", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        const currentResult = await client.query(
          `SELECT status, deployment_tier, residency_region, custom_domain,
                  branding_status, identity_provider_status, operational_version
           FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId]);
        const current = currentResult.rows[0];
        if (!current) throw new NotFoundException("Tenant was not found");
        requireVersion(input.expectedVersion, current.operational_version, "Tenant operations");
        await client.query(
          `UPDATE tenants SET
             deployment_tier = COALESCE($2, deployment_tier),
             residency_region = COALESCE($3, residency_region),
             custom_domain = COALESCE($4, custom_domain),
             branding_status = COALESCE($5, branding_status),
             identity_provider_status = COALESCE($6, identity_provider_status),
             operational_version = operational_version + 1,
             updated_at = now()
           WHERE id = $1`,
          [tenantId, input.deploymentTier ?? null, input.residencyRegion ?? null,
            input.customDomain ?? null, input.brandingStatus ?? null,
            input.identityProviderStatus ?? null],
        );
        await client.query(
          `INSERT INTO tenant_operational_profiles (
             tenant_id, quota_policy, support_contacts, updated_by
           ) VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id) DO UPDATE SET
             quota_policy = COALESCE($2, tenant_operational_profiles.quota_policy),
             support_contacts = COALESCE($3, tenant_operational_profiles.support_contacts),
             version = tenant_operational_profiles.version + 1,
             updated_by = $4, updated_at = now()`,
          [tenantId, input.quotaPolicy ?? null, input.supportContacts ?? null, principal.userId],
        );
        const changed: Array<[string, unknown, unknown]> = [
          ["deployment-tier-changed", current.deployment_tier, input.deploymentTier],
          ["region-changed", current.residency_region, input.residencyRegion],
          ["domain-changed", current.custom_domain, input.customDomain],
          ["branding-status-changed", current.branding_status, input.brandingStatus],
          ["identity-provider-status-changed", current.identity_provider_status, input.identityProviderStatus],
        ];
        for (const [transition, before, after] of changed) {
          if (after !== undefined && before !== after) {
            await this.lifecycleEvent(client, tenantId, transition, null, null, reason, principal.userId,
              principalCorrelation(correlationId), { before, after });
          }
        }
        await this.audit.append(client, {
          eventType: "tenant.operations.updated", actorId: principal.userId,
          resourceType: "tenant", resourceId: tenantId,
          correlationId: principalCorrelation(correlationId),
          metadata: { reason, fields: Object.keys(input).filter((field) => field !== "reason") },
        });
        return { tenantId, version: current.operational_version + 1, status: current.status };
      });
  }

  async changeTenantLifecycle(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    input: ChangeTenantLifecycleDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, `tenant.lifecycle.${input.action}`, "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        const result = await client.query(
          `SELECT status, operational_version FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId]);
        const tenant = result.rows[0];
        if (!tenant) throw new NotFoundException("Tenant was not found");
        requireVersion(input.expectedVersion, tenant.operational_version, "Tenant lifecycle");
        const target = lifecycleTargets[tenant.status]?.[input.action];
        if (!target) throw new ConflictException(`Tenant cannot ${input.action} from ${tenant.status}`);
        await client.query(
          `UPDATE tenants SET status = $2, operational_version = operational_version + 1,
                              updated_at = now() WHERE id = $1`, [tenantId, target]);
        const transition = input.action === "activate" ? "activated"
          : input.action === "suspend" ? "suspended"
          : input.action === "resume" ? "resumed"
          : input.action === "start-offboarding" ? "offboarding-started" : "closed";
        await this.lifecycleEvent(client, tenantId, transition, tenant.status, target, reason,
          principal.userId, principalCorrelation(correlationId), {});
        await this.audit.append(client, {
          eventType: `tenant.lifecycle.${transition}`, actorId: principal.userId,
          resourceType: "tenant", resourceId: tenantId,
          correlationId: principalCorrelation(correlationId),
          metadata: { from: tenant.status, to: target, reason },
        });
        return { tenantId, status: target, version: tenant.operational_version + 1 };
      });
  }

  async requestExport(principal: AuthenticatedPrincipal, tenantId: string, input: RequestTenantExportDto,
    idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.export.request", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        await this.requireTenant(client, tenantId);
        const result = await client.query(
          `INSERT INTO tenant_export_receipts (
             tenant_id, export_type, status, requested_by, expires_at, metadata, correlation_id
           ) VALUES ($1,$2,'requested',$3,$4,$5,$6)
           RETURNING id, status, requested_at`,
          [tenantId, input.exportType, principal.userId, input.expiresAt ?? null, { reason }, principalCorrelation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: "tenant.export.requested", actorId: principal.userId,
          resourceType: "tenant-export", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, exportType: input.exportType, reason },
        });
        return camel({ tenant_id: tenantId, ...result.rows[0] });
      });
  }

  async completeExport(principal: AuthenticatedPrincipal, tenantId: string, receiptId: string,
    input: CompleteTenantExportDto, idempotencyKey: string, correlationId?: string) {
    return this.executor.run(principal, idempotencyKey, "tenant.export.complete", "tenant-export", receiptId,
      canonicalHash({ tenantId, receiptId, ...input }), async (client) => {
        const result = await client.query(
          `UPDATE tenant_export_receipts
           SET status = 'completed', storage_reference = $3, checksum_sha256 = $4,
               completed_at = now(), metadata = metadata || $5::jsonb
           WHERE id = $1 AND tenant_id = $2 AND status IN ('requested','processing')
           RETURNING id, status, completed_at`,
          [receiptId, tenantId, input.storageReference, input.checksumSha256, input.metadata ?? {}],
        );
        if (!result.rowCount) throw new NotFoundException("Completable tenant export receipt was not found");
        await this.audit.append(client, {
          eventType: "tenant.export.completed", actorId: principal.userId,
          resourceType: "tenant-export", resourceId: receiptId,
          correlationId: principalCorrelation(correlationId),
          metadata: { tenantId, checksumSha256: input.checksumSha256, storageReference: input.storageReference },
        });
        return camel(result.rows[0]);
      });
  }

  async createRetentionHold(principal: AuthenticatedPrincipal, tenantId: string, input: CreateRetentionHoldDto,
    idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.retention-hold.create", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        await this.requireTenant(client, tenantId);
        const result = await client.query(
          `INSERT INTO tenant_retention_holds (
             tenant_id, hold_type, reason, reference, expires_at,
             created_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, status, starts_at, expires_at`,
          [tenantId, input.holdType, reason, input.reference ?? null, input.expiresAt ?? null,
            principal.userId, principalCorrelation(correlationId)],
        );
        await client.query(
          `UPDATE tenant_deletion_schedules SET state = 'blocked-by-hold', updated_at = now()
           WHERE tenant_id = $1 AND state = 'scheduled'`, [tenantId]);
        await this.audit.append(client, {
          eventType: "tenant.retention-hold.created", actorId: principal.userId,
          resourceType: "tenant-retention-hold", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, holdType: input.holdType, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async releaseRetentionHold(principal: AuthenticatedPrincipal, tenantId: string, holdId: string,
    input: ReleaseRetentionHoldDto, idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.retention-hold.release", "tenant-retention-hold", holdId,
      canonicalHash({ tenantId, holdId, reason }), async (client) => {
        const result = await client.query(
          `UPDATE tenant_retention_holds SET status = 'released', released_at = now(), released_by = $3
           WHERE id = $1 AND tenant_id = $2 AND status = 'active'
           RETURNING id, status, released_at`, [holdId, tenantId, principal.userId]);
        if (!result.rowCount) throw new NotFoundException("Active retention hold was not found");
        const active = await client.query(
          `SELECT 1 FROM tenant_retention_holds
           WHERE tenant_id = $1 AND status = 'active'
             AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`, [tenantId]);
        if (!active.rowCount) {
          await client.query(
            `UPDATE tenant_deletion_schedules SET state = 'scheduled', updated_at = now()
             WHERE tenant_id = $1 AND state = 'blocked-by-hold'`, [tenantId]);
        }
        await this.audit.append(client, {
          eventType: "tenant.retention-hold.released", actorId: principal.userId,
          resourceType: "tenant-retention-hold", resourceId: holdId,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async scheduleDeletion(principal: AuthenticatedPrincipal, tenantId: string, input: ScheduleTenantDeletionDto,
    idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.deletion.schedule", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        const receipt = await client.query(
          `SELECT id FROM tenant_export_receipts
           WHERE id = $1 AND tenant_id = $2 AND export_type = 'full-tenant' AND status = 'completed'`,
          [input.exportReceiptId, tenantId]);
        if (!receipt.rowCount) throw new BadRequestException("Completed full-tenant export receipt is required");
        const hold = await client.query(
          `SELECT 1 FROM tenant_retention_holds
           WHERE tenant_id = $1 AND status = 'active'
             AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`, [tenantId]);
        const state = hold.rowCount ? "blocked-by-hold" : "scheduled";
        const result = await client.query(
          `INSERT INTO tenant_deletion_schedules (
             tenant_id, scheduled_for, state, reason, export_receipt_id,
             created_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, state, scheduled_for, created_at`,
          [tenantId, input.scheduledFor, state, reason, input.exportReceiptId,
            principal.userId, principalCorrelation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: "tenant.deletion.scheduled", actorId: principal.userId,
          resourceType: "tenant-deletion", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId),
          metadata: { tenantId, scheduledFor: input.scheduledFor, state, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async cancelDeletion(principal: AuthenticatedPrincipal, tenantId: string, scheduleId: string,
    input: CancelTenantDeletionDto, idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.deletion.cancel", "tenant-deletion", scheduleId,
      canonicalHash({ tenantId, scheduleId, reason }), async (client) => {
        const result = await client.query(
          `UPDATE tenant_deletion_schedules
           SET state = 'cancelled', cancelled_by = $3,
               metadata = metadata || jsonb_build_object('cancellationReason',$4), updated_at = now()
           WHERE id = $1 AND tenant_id = $2 AND state IN ('scheduled','blocked-by-hold')
           RETURNING id, state, updated_at`, [scheduleId, tenantId, principal.userId, reason]);
        if (!result.rowCount) throw new NotFoundException("Cancellable deletion schedule was not found");
        await this.audit.append(client, {
          eventType: "tenant.deletion.cancelled", actorId: principal.userId,
          resourceType: "tenant-deletion", resourceId: scheduleId,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async setEntitlementOverride(principal: AuthenticatedPrincipal, tenantId: string,
    input: SetEntitlementOverrideDto, idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.entitlement.override", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        await this.requireTenant(client, tenantId);
        const previous = await client.query(
          `SELECT state, limits, valid_from, valid_until FROM tenant_entitlements
           WHERE tenant_id = $1 AND module_key = $2 FOR UPDATE`, [tenantId, input.moduleKey]);
        await client.query(
          `INSERT INTO tenant_entitlement_overrides (
             tenant_id, module_key, state, limits, effective_from, effective_until,
             reason, billing_reference, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tenantId, input.moduleKey, input.state, input.limits ?? {}, input.effectiveFrom,
            input.effectiveUntil ?? null, reason, input.billingReference ?? null, principal.userId],
        );
        if (new Date(input.effectiveFrom).getTime() <= Date.now()) {
          await client.query(
            `INSERT INTO tenant_entitlements (
               tenant_id, module_key, state, limits, valid_from, valid_until
             ) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (tenant_id, module_key) DO UPDATE SET
               state = EXCLUDED.state, limits = EXCLUDED.limits,
               valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
               updated_at = now()`,
            [tenantId, input.moduleKey, input.state, input.limits ?? {}, input.effectiveFrom,
              input.effectiveUntil ?? null],
          );
        }
        const resulting = {
          state: input.state, limits: input.limits ?? {},
          effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil ?? null,
        };
        await client.query(
          `INSERT INTO tenant_entitlement_history (
             tenant_id, module_key, source, previous_state, resulting_state,
             reason, effective_at, actor_id, correlation_id
           ) VALUES ($1,$2,'override',$3,$4,$5,$6,$7,$8)`,
          [tenantId, input.moduleKey, previous.rows[0] ?? null, resulting, reason,
            input.effectiveFrom, principal.userId, principalCorrelation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: "tenant.entitlement.overridden", actorId: principal.userId,
          resourceType: "tenant-entitlement", resourceId: `${tenantId}:${input.moduleKey}`,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, moduleKey: input.moduleKey, ...resulting, reason },
        });
        return { tenantId, moduleKey: input.moduleKey, ...resulting };
      });
  }

  async setUsageThreshold(principal: AuthenticatedPrincipal, tenantId: string, input: SetUsageThresholdDto,
    idempotencyKey: string, correlationId?: string) {
    if (input.criticalValue < input.warningValue) {
      throw new BadRequestException("Critical threshold must be greater than or equal to warning threshold");
    }
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.usage-threshold.set", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        await this.requireTenant(client, tenantId);
        await client.query(
          `UPDATE tenant_usage_thresholds SET effective_until = $3
           WHERE tenant_id = $1 AND metric_key = $2 AND effective_until IS NULL
             AND effective_from < $3`, [tenantId, input.metricKey, input.effectiveFrom]);
        const result = await client.query(
          `INSERT INTO tenant_usage_thresholds (
             tenant_id, metric_key, warning_value, critical_value, enforcement,
             effective_from, effective_until, created_by, reason
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, effective_from, effective_until`,
          [tenantId, input.metricKey, input.warningValue, input.criticalValue, input.enforcement,
            input.effectiveFrom, input.effectiveUntil ?? null, principal.userId, reason],
        );
        await this.audit.append(client, {
          eventType: "tenant.usage-threshold.set", actorId: principal.userId,
          resourceType: "tenant-threshold", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, metricKey: input.metricKey, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async setBillingLink(principal: AuthenticatedPrincipal, tenantId: string, input: SetBillingLinkDto,
    idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "tenant.billing-link.set", "tenant", tenantId,
      canonicalHash({ tenantId, ...input, reason }), async (client) => {
        await this.requireTenant(client, tenantId);
        await client.query(
          `UPDATE tenant_billing_links SET effective_until = $3
           WHERE tenant_id = $1 AND provider_key = $2 AND effective_until IS NULL
             AND effective_from < $3`, [tenantId, input.providerKey, input.effectiveFrom]);
        const result = await client.query(
          `INSERT INTO tenant_billing_links (
             tenant_id, provider_key, external_customer_reference,
             external_subscription_reference, billing_state,
             effective_from, effective_until, metadata, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, billing_state, effective_from, effective_until`,
          [tenantId, input.providerKey, input.externalCustomerReference,
            input.externalSubscriptionReference ?? null, input.billingState,
            input.effectiveFrom, input.effectiveUntil ?? null,
            { ...(input.metadata ?? {}), operatorReason: reason }, principal.userId],
        );
        await this.audit.append(client, {
          eventType: "tenant.billing-link.set", actorId: principal.userId,
          resourceType: "tenant-billing", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId, providerKey: input.providerKey, billingState: input.billingState, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async supportOverview() {
    const [cases, sessions, incidents] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT case_record.id, case_record.case_key, case_record.tenant_id,
                tenant.display_name tenant_name, case_record.title, case_record.purpose,
                case_record.requested_scope, case_record.state, case_record.severity,
                case_record.customer_contact, case_record.created_at, case_record.resolved_at,
                case_record.version,
                approval.id latest_approval_id, approval.decision latest_approval_decision,
                approval.customer_approver_name, approval.customer_approver_email,
                approval.approval_reference, approval.approved_scope,
                approval.expires_at approval_expires_at
         FROM support_cases case_record
         JOIN tenants tenant ON tenant.id = case_record.tenant_id
         LEFT JOIN LATERAL (
           SELECT * FROM support_case_approvals item
           WHERE item.support_case_id = case_record.id
           ORDER BY item.recorded_at DESC LIMIT 1
         ) approval ON true
         ORDER BY CASE case_record.state WHEN 'active' THEN 0 WHEN 'approved' THEN 1
                  WHEN 'awaiting-customer-approval' THEN 2 ELSE 3 END,
                  case_record.created_at DESC LIMIT 200`),
      this.database.controlPlaneQuery(
        `SELECT session.id, session.support_case_id, case_record.case_key,
                session.tenant_id, tenant.display_name tenant_name,
                session.operator_id, operator.display_name operator_name,
                session.granted_scope, session.state, session.started_at,
                session.expires_at, session.terminated_at,
                session.termination_reason, session.assisted_session_indicator
         FROM support_elevation_sessions session
         JOIN support_cases case_record ON case_record.id = session.support_case_id
         JOIN tenants tenant ON tenant.id = session.tenant_id
         JOIN users operator ON operator.id = session.operator_id
         ORDER BY session.state = 'active' DESC, session.started_at DESC LIMIT 200`),
      this.database.controlPlaneQuery(
        `SELECT incident.id, incident.incident_key, incident.tenant_id,
                tenant.display_name tenant_name, incident.support_case_id,
                incident.severity, incident.category, incident.summary,
                incident.state, incident.evidence, incident.reported_by,
                reporter.display_name reporter_name, incident.assigned_to,
                incident.reported_at, incident.contained_at,
                incident.resolved_at, incident.closed_at
         FROM platform_security_incidents incident
         LEFT JOIN tenants tenant ON tenant.id = incident.tenant_id
         JOIN users reporter ON reporter.id = incident.reported_by
         ORDER BY CASE incident.state WHEN 'open' THEN 0 WHEN 'contained' THEN 1 ELSE 2 END,
                  CASE incident.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  incident.reported_at DESC LIMIT 200`),
    ]);
    return { generatedAt: new Date().toISOString(), cases: rows(cases), sessions: rows(sessions), incidents: rows(incidents) };
  }

  async createSupportCase(principal: AuthenticatedPrincipal, input: CreateSupportCaseDto,
    idempotencyKey: string, correlationId?: string) {
    const purpose = operationalReason(input.purpose);
    const caseKey = key("SUP");
    return this.executor.run(principal, idempotencyKey, "support.case.create", "tenant", input.tenantId,
      canonicalHash({ ...input, purpose }), async (client) => {
        await this.requireTenant(client, input.tenantId);
        const result = await client.query(
          `INSERT INTO support_cases (
             case_key, tenant_id, title, purpose, requested_scope, severity,
             customer_contact, created_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, case_key, state, created_at, version`,
          [caseKey, input.tenantId, input.title.trim(), purpose,
            [...new Set(input.requestedScope)], input.severity, input.customerContact,
            principal.userId, principalCorrelation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: "support.case.created", actorId: principal.userId,
          resourceType: "support-case", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId),
          metadata: { caseKey, tenantId: input.tenantId, purpose, requestedScope: input.requestedScope, severity: input.severity },
        });
        return camel(result.rows[0]);
      });
  }

  async recordCustomerApproval(principal: AuthenticatedPrincipal, caseId: string,
    input: RecordCustomerApprovalDto, idempotencyKey: string, correlationId?: string) {
    return this.executor.run(principal, idempotencyKey, "support.case.customer-approval", "support-case", caseId,
      canonicalHash({ caseId, ...input }), async (client) => {
        const caseResult = await client.query(
          `SELECT tenant_id, requested_scope, state, version FROM support_cases WHERE id = $1 FOR UPDATE`, [caseId]);
        const supportCase = caseResult.rows[0];
        if (!supportCase) throw new NotFoundException("Support case was not found");
        if (input.decision === "approved" && !input.approvedScope.every((scope) => supportCase.requested_scope.includes(scope))) {
          throw new BadRequestException("Customer approval scope exceeds the support request");
        }
        const approval = await client.query(
          `INSERT INTO support_case_approvals (
             support_case_id, decision, customer_approver_name,
             customer_approver_email, approval_reference, approved_scope,
             expires_at, recorded_by, evidence, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, decision, expires_at, recorded_at`,
          [caseId, input.decision, input.customerApproverName.trim(), input.customerApproverEmail,
            input.approvalReference.trim(), [...new Set(input.approvedScope)], input.expiresAt,
            principal.userId, input.evidence ?? {}, principalCorrelation(correlationId)],
        );
        const state = input.decision === "approved" ? "approved" : input.decision === "rejected" ? "rejected" : "awaiting-customer-approval";
        await client.query(
          `UPDATE support_cases SET state = $2, version = version + 1 WHERE id = $1`, [caseId, state]);
        if (input.decision === "revoked") {
          await client.query(
            `UPDATE support_elevation_sessions
             SET state = 'terminated', terminated_at = now(),
                 termination_reason = 'Customer approval was revoked'
             WHERE support_case_id = $1 AND state = 'active'`, [caseId]);
        }
        await this.audit.append(client, {
          eventType: `support.customer-approval.${input.decision}`, actorId: principal.userId,
          resourceType: "support-case", resourceId: caseId,
          correlationId: principalCorrelation(correlationId),
          metadata: { tenantId: supportCase.tenant_id, approvalReference: input.approvalReference, approvedScope: input.approvedScope, expiresAt: input.expiresAt },
        });
        return { caseId, state, approval: camel(approval.rows[0]) };
      });
  }

  async startElevation(principal: AuthenticatedPrincipal, caseId: string,
    input: StartSupportElevationDto, idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "support.elevation.start", "support-case", caseId,
      canonicalHash({ caseId, ...input, reason }), async (client) => {
        const caseResult = await client.query(
          `SELECT tenant_id, state FROM support_cases WHERE id = $1 FOR UPDATE`, [caseId]);
        const supportCase = caseResult.rows[0];
        if (!supportCase) throw new NotFoundException("Support case was not found");
        const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
        const result = await client.query(
          `INSERT INTO support_elevation_sessions (
             support_case_id, tenant_id, operator_id, approval_id,
             granted_scope, expires_at, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, state, started_at, expires_at, assisted_session_indicator`,
          [caseId, supportCase.tenant_id, principal.userId, input.approvalId,
            [...new Set(input.grantedScope)], expiresAt, principalCorrelation(correlationId)],
        );
        await client.query(`UPDATE support_cases SET state = 'active', version = version + 1 WHERE id = $1`, [caseId]);
        await client.query(
          `INSERT INTO support_session_events (
             support_session_id, event_type, actor_id, purpose, correlation_id, evidence
           ) VALUES ($1,'started',$2,$3,$4,$5)`,
          [result.rows[0].id, principal.userId, reason, principalCorrelation(correlationId),
            { grantedScope: input.grantedScope, expiresAt: expiresAt.toISOString() }],
        );
        await this.audit.append(client, {
          eventType: "support.elevation.started", actorId: principal.userId,
          resourceType: "support-session", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId),
          metadata: { caseId, tenantId: supportCase.tenant_id, grantedScope: input.grantedScope, expiresAt: expiresAt.toISOString(), reason },
        });
        return camel(result.rows[0]);
      });
  }

  async terminateSession(principal: AuthenticatedPrincipal, sessionId: string,
    input: TerminateSupportSessionDto, idempotencyKey: string, correlationId?: string) {
    const reason = operationalReason(input.reason);
    return this.executor.run(principal, idempotencyKey, "support.elevation.terminate", "support-session", sessionId,
      canonicalHash({ sessionId, reason }), async (client) => {
        const result = await client.query(
          `UPDATE support_elevation_sessions
           SET state = 'terminated', terminated_at = now(), termination_reason = $2
           WHERE id = $1 AND state = 'active'
           RETURNING id, support_case_id, tenant_id, state, terminated_at`, [sessionId, reason]);
        if (!result.rowCount) throw new NotFoundException("Active support session was not found");
        await client.query(
          `INSERT INTO support_session_events (
             support_session_id, event_type, actor_id, purpose, correlation_id, evidence
           ) VALUES ($1,'terminated',$2,$3,$4,$5)`,
          [sessionId, principal.userId, reason, principalCorrelation(correlationId), {}],
        );
        await this.audit.append(client, {
          eventType: "support.elevation.terminated", actorId: principal.userId,
          resourceType: "support-session", resourceId: sessionId,
          correlationId: principalCorrelation(correlationId),
          metadata: { tenantId: result.rows[0].tenant_id, caseId: result.rows[0].support_case_id, reason },
        });
        return camel(result.rows[0]);
      });
  }

  async resolveSupportCase(principal: AuthenticatedPrincipal, caseId: string,
    input: ResolveSupportCaseDto, idempotencyKey: string, correlationId?: string) {
    const resolution = operationalReason(input.resolution);
    return this.executor.run(principal, idempotencyKey, "support.case.resolve", "support-case", caseId,
      canonicalHash({ caseId, resolution }), async (client) => {
        const result = await client.query(
          `UPDATE support_cases SET state = 'resolved', resolved_at = now(), version = version + 1
           WHERE id = $1 AND state NOT IN ('resolved','cancelled')
           RETURNING id, tenant_id, state, resolved_at`, [caseId]);
        if (!result.rowCount) throw new NotFoundException("Resolvable support case was not found");
        await client.query(
          `UPDATE support_elevation_sessions
           SET state = 'terminated', terminated_at = now(), termination_reason = $2
           WHERE support_case_id = $1 AND state = 'active'`, [caseId, resolution]);
        await this.audit.append(client, {
          eventType: "support.case.resolved", actorId: principal.userId,
          resourceType: "support-case", resourceId: caseId,
          correlationId: principalCorrelation(correlationId), metadata: { tenantId: result.rows[0].tenant_id, resolution },
        });
        return camel(result.rows[0]);
      });
  }

  async recordSecurityIncident(principal: AuthenticatedPrincipal, input: RecordSecurityIncidentDto,
    idempotencyKey: string, correlationId?: string) {
    const summary = operationalReason(input.summary);
    const incidentKey = key("SEC");
    return this.executor.run(principal, idempotencyKey, "security.incident.record", "security-incident", incidentKey,
      canonicalHash({ ...input, summary }), async (client) => {
        if (input.tenantId) await this.requireTenant(client, input.tenantId);
        const result = await client.query(
          `INSERT INTO platform_security_incidents (
             incident_key, tenant_id, support_case_id, severity, category,
             summary, evidence, reported_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, incident_key, state, reported_at`,
          [incidentKey, input.tenantId ?? null, input.supportCaseId ?? null,
            input.severity, input.category.trim(), summary, input.evidence ?? {},
            principal.userId, principalCorrelation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: "security.incident.recorded", actorId: principal.userId,
          resourceType: "security-incident", resourceId: result.rows[0].id,
          correlationId: principalCorrelation(correlationId),
          metadata: { incidentKey, tenantId: input.tenantId ?? null, severity: input.severity, category: input.category, summary },
        });
        return camel(result.rows[0]);
      });
  }

  private async lifecycleEvent(
    client: PoolClient, tenantId: string, transition: string,
    fromStatus: string | null, toStatus: string | null, reason: string,
    actorId: string, correlationId: string, evidence: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO tenant_lifecycle_events (
         tenant_id, transition, from_status, to_status, reason,
         actor_id, correlation_id, evidence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, transition, fromStatus, toStatus, reason, actorId, correlationId, evidence],
    );
  }

  private async requireTenant(client: PoolClient, tenantId: string) {
    const result = await client.query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    if (!result.rowCount) throw new NotFoundException("Tenant was not found");
  }
}
