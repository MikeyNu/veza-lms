import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type {
  AssignTenantPlanDto,
  CreatePlanPolicyDto,
  TransitionPlanPolicyDto,
  UpsertModuleCatalogueDto,
} from "./commercial-release-governance.dto.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import {
  canonicalHash,
  operationalReason,
  PlatformOperationExecutor,
  requireVersion,
} from "./release-governance-mutation-support.js";

type Row = QueryResultRow & Record<string, unknown>;

function camel(row: Row): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    value instanceof Date ? value.toISOString() : value,
  ]));
}

function rows(result: { rows: Row[] }): readonly Record<string, unknown>[] {
  return result.rows.map(camel);
}

function correlation(value?: string): string {
  return value?.trim() || "missing-correlation-id";
}

@Injectable()
export class CommercialGovernanceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly executor: PlatformOperationExecutor,
    private readonly audit: PlatformAuditWriter,
  ) {}

  async overview() {
    const [plans, modules, policies, policyModules, history, assignments, denials] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT plan.key, plan.display_name, plan.active, plan.limits,
                count(tenant.id)::integer tenant_count,
                count(tenant.id) FILTER (WHERE tenant.status = 'active')::integer active_tenant_count,
                active_policy.id active_policy_id,
                active_policy.version_number active_policy_version,
                active_policy.default_trial_days,
                active_policy.effective_from,
                active_policy.effective_until,
                active_policy.billing_product_reference
         FROM plans plan
         LEFT JOIN tenants tenant ON tenant.plan_key = plan.key
         LEFT JOIN plan_policy_versions active_policy
           ON active_policy.plan_key = plan.key AND active_policy.lifecycle = 'active'
         GROUP BY plan.key, plan.display_name, plan.active, plan.limits,
                  active_policy.id, active_policy.version_number,
                  active_policy.default_trial_days, active_policy.effective_from,
                  active_policy.effective_until, active_policy.billing_product_reference
         ORDER BY plan.active DESC, plan.display_name`,
      ),
      this.database.controlPlaneQuery(
        `SELECT module_key, display_name, description, category, status,
                quota_schema, billing_metric_key, version, updated_at
         FROM plan_module_catalogue
         ORDER BY status = 'active' DESC, category, display_name`,
      ),
      this.database.controlPlaneQuery(
        `SELECT policy.id, policy.plan_key, policy.version_number,
                policy.display_name, policy.description, policy.lifecycle,
                policy.limits, policy.default_trial_days, policy.effective_from,
                policy.effective_until, policy.billing_product_reference,
                policy.reason, policy.created_by, policy.approved_by,
                policy.approved_at, policy.version, policy.created_at,
                count(module.module_key)::integer module_count
         FROM plan_policy_versions policy
         LEFT JOIN plan_policy_module_entitlements module
           ON module.plan_policy_version_id = policy.id
         GROUP BY policy.id
         ORDER BY policy.plan_key, policy.version_number DESC`,
      ),
      this.database.controlPlaneQuery(
        `SELECT plan_policy_version_id, module_key, state, limits, trial_days
         FROM plan_policy_module_entitlements
         ORDER BY plan_policy_version_id, module_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT id, plan_key, policy_version_id, event_type, reason,
                actor_id, correlation_id, evidence, occurred_at
         FROM plan_change_history
         ORDER BY occurred_at DESC, id DESC LIMIT 250`,
      ),
      this.database.controlPlaneQuery(
        `SELECT assignment.id, assignment.tenant_id, tenant.display_name tenant_name,
                assignment.plan_key, assignment.plan_policy_version_id,
                assignment.state, assignment.effective_from, assignment.reason,
                assignment.applied_at, assignment.failure_reason,
                assignment.created_at
         FROM tenant_plan_assignments assignment
         JOIN tenants tenant ON tenant.id = assignment.tenant_id
         ORDER BY assignment.state = 'scheduled' DESC,
                  assignment.effective_from DESC LIMIT 200`,
      ),
      this.database.controlPlaneQuery(
        `SELECT denial.tenant_id, tenant.display_name tenant_name,
                denial.module_key, denial.capability_key, denial.denial_code,
                denial.reason_summary, denial.correlation_id, denial.denied_at
         FROM entitlement_denial_diagnostics denial
         JOIN tenants tenant ON tenant.id = denial.tenant_id
         ORDER BY denial.denied_at DESC LIMIT 200`,
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      plans: rows(plans),
      modules: rows(modules),
      policies: rows(policies),
      policyModules: rows(policyModules),
      history: rows(history),
      assignments: rows(assignments),
      denials: rows(denials),
    };
  }

  async upsertModule(
    principal: AuthenticatedPrincipal,
    input: UpsertModuleCatalogueDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    const moduleKey = input.moduleKey.trim().toLowerCase();
    return this.executor.run(
      principal,
      idempotencyKey,
      "commercial.module.upsert",
      "plan-module",
      moduleKey,
      canonicalHash({ ...input, moduleKey, reason }),
      async (client) => {
        const result = await client.query(
          `INSERT INTO plan_module_catalogue (
             module_key, display_name, description, category, status,
             quota_schema, billing_metric_key, created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           ON CONFLICT (module_key) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             status = EXCLUDED.status,
             quota_schema = EXCLUDED.quota_schema,
             billing_metric_key = EXCLUDED.billing_metric_key,
             version = plan_module_catalogue.version + 1,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
           RETURNING module_key, status, version, updated_at`,
          [moduleKey, input.displayName.trim(), input.description.trim(), input.category,
            input.status, input.quotaSchema ?? {}, input.billingMetricKey ?? null,
            principal.userId],
        );
        await this.audit.append(client, {
          eventType: "commercial.module.configured",
          actorId: principal.userId,
          resourceType: "plan-module",
          resourceId: moduleKey,
          correlationId: correlation(correlationId),
          metadata: { reason, category: input.category, status: input.status },
        });
        return camel(result.rows[0]);
      },
    );
  }

  async createPolicy(
    principal: AuthenticatedPrincipal,
    input: CreatePlanPolicyDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    const planKey = input.planKey.trim().toLowerCase();
    if (new Set(input.modules.map((item) => item.moduleKey)).size !== input.modules.length) {
      throw new BadRequestException("Plan policy contains duplicate module keys");
    }
    return this.executor.run(
      principal,
      idempotencyKey,
      "commercial.plan-policy.create",
      "plan",
      planKey,
      canonicalHash({ ...input, planKey, reason }),
      async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`plan-policy:${planKey}`]);
        await client.query(
          `INSERT INTO plans (key, display_name, active, limits)
           VALUES ($1,$2,false,$3)
           ON CONFLICT (key) DO NOTHING`,
          [planKey, input.displayName.trim(), input.limits],
        );
        const available = await client.query(
          `SELECT module_key FROM plan_module_catalogue
           WHERE module_key = ANY($1::text[]) AND status <> 'retired'`,
          [input.modules.map((item) => item.moduleKey)],
        );
        if (available.rowCount !== input.modules.length) {
          throw new BadRequestException("Plan policy references an unavailable module");
        }
        const sequence = await client.query(
          `SELECT COALESCE(max(version_number),0) + 1 next_version
           FROM plan_policy_versions WHERE plan_key = $1`,
          [planKey],
        );
        const versionNumber = Number(sequence.rows[0].next_version);
        const policy = await client.query(
          `INSERT INTO plan_policy_versions (
             plan_key, version_number, display_name, description, limits,
             default_trial_days, effective_from, effective_until,
             billing_product_reference, reason, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id, lifecycle, version, created_at`,
          [planKey, versionNumber, input.displayName.trim(), input.description.trim(),
            input.limits, input.defaultTrialDays, input.effectiveFrom,
            input.effectiveUntil ?? null, input.billingProductReference ?? null,
            reason, principal.userId],
        );
        for (const modulePolicy of input.modules) {
          if (modulePolicy.state !== "trial" && modulePolicy.trialDays !== 0) {
            throw new BadRequestException("Trial days are only valid for trial modules");
          }
          await client.query(
            `INSERT INTO plan_policy_module_entitlements (
               plan_policy_version_id, module_key, state, limits, trial_days
             ) VALUES ($1,$2,$3,$4,$5)`,
            [policy.rows[0].id, modulePolicy.moduleKey, modulePolicy.state,
              modulePolicy.limits ?? {}, modulePolicy.trialDays],
          );
        }
        await client.query(
          `INSERT INTO plan_change_history (
             plan_key, policy_version_id, event_type, reason,
             actor_id, correlation_id, evidence
           ) VALUES ($1,$2,'created',$3,$4,$5,$6)`,
          [planKey, policy.rows[0].id, reason, principal.userId,
            correlation(correlationId), { versionNumber, modules: input.modules }],
        );
        await this.audit.append(client, {
          eventType: "commercial.plan-policy.created",
          actorId: principal.userId,
          resourceType: "plan-policy",
          resourceId: policy.rows[0].id,
          correlationId: correlation(correlationId),
          metadata: { planKey, versionNumber, effectiveFrom: input.effectiveFrom, reason },
        });
        return { planKey, versionNumber, ...camel(policy.rows[0]) };
      },
    );
  }

  async transitionPolicy(
    principal: AuthenticatedPrincipal,
    policyId: string,
    input: TransitionPlanPolicyDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      `commercial.plan-policy.${input.action}`,
      "plan-policy",
      policyId,
      canonicalHash({ policyId, ...input, reason }),
      async (client) => {
        const result = await client.query(
          `SELECT id, plan_key, lifecycle, created_by, approved_by,
                  effective_from, version
           FROM plan_policy_versions WHERE id = $1 FOR UPDATE`,
          [policyId],
        );
        const policy = result.rows[0];
        if (!policy) throw new NotFoundException("Plan policy was not found");
        requireVersion(input.expectedVersion, policy.version, "Plan policy");
        let lifecycle = policy.lifecycle as string;
        if (input.action === "approve") {
          if (lifecycle !== "draft") throw new ConflictException("Only draft policies can be approved");
          if (policy.created_by === principal.userId) {
            throw new ConflictException("Plan policy approval requires a different operator");
          }
          await client.query(
            `UPDATE plan_policy_versions
             SET approved_by = $2, approved_at = now(), version = version + 1,
                 updated_at = now() WHERE id = $1`,
            [policyId, principal.userId],
          );
        } else {
          if (!policy.approved_by && ["schedule", "activate"].includes(input.action)) {
            throw new ConflictException("Plan policy requires independent approval");
          }
          if (input.action === "schedule") {
            if (lifecycle !== "draft") throw new ConflictException("Only approved drafts can be scheduled");
            lifecycle = "scheduled";
          } else if (input.action === "activate") {
            if (!["draft", "scheduled"].includes(lifecycle)) throw new ConflictException("Plan policy cannot be activated from its current state");
            if (new Date(policy.effective_from).getTime() > Date.now()) {
              throw new ConflictException("Future plan policies must be scheduled");
            }
            lifecycle = "active";
          } else if (input.action === "retire") {
            if (!["active", "scheduled"].includes(lifecycle)) throw new ConflictException("Plan policy cannot be retired from its current state");
            lifecycle = "retired";
          } else {
            if (!["draft", "scheduled"].includes(lifecycle)) throw new ConflictException("Plan policy cannot be cancelled from its current state");
            lifecycle = "cancelled";
          }
          await client.query(
            `UPDATE plan_policy_versions
             SET lifecycle = $2,
                 effective_until = CASE WHEN $2 = 'retired' THEN COALESCE(effective_until, now()) ELSE effective_until END,
                 version = version + 1, updated_at = now()
             WHERE id = $1`,
            [policyId, lifecycle],
          );
        }
        const eventType = input.action === "approve" ? "approved" : input.action === "schedule" ? "scheduled" : input.action === "activate" ? "activated" : input.action === "retire" ? "retired" : "cancelled";
        await client.query(
          `INSERT INTO plan_change_history (
             plan_key, policy_version_id, event_type, reason,
             actor_id, correlation_id, evidence
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [policy.plan_key, policyId, eventType, reason, principal.userId,
            correlation(correlationId), { previousLifecycle: policy.lifecycle, resultingLifecycle: lifecycle }],
        );
        await this.audit.append(client, {
          eventType: `commercial.plan-policy.${eventType}`,
          actorId: principal.userId,
          resourceType: "plan-policy",
          resourceId: policyId,
          correlationId: correlation(correlationId),
          metadata: { planKey: policy.plan_key, reason, lifecycle },
        });
        return { id: policyId, planKey: policy.plan_key, lifecycle, version: policy.version + 1 };
      },
    );
  }

  async assignTenantPlan(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    input: AssignTenantPlanDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      "commercial.tenant-plan.assign",
      "tenant",
      tenantId,
      canonicalHash({ tenantId, ...input, reason }),
      async (client) => {
        const tenant = await client.query(
          `SELECT operational_version FROM tenants WHERE id = $1 FOR UPDATE`,
          [tenantId],
        );
        if (!tenant.rows[0]) throw new NotFoundException("Tenant was not found");
        requireVersion(input.expectedTenantVersion, tenant.rows[0].operational_version, "Tenant");
        const policy = await client.query(
          `SELECT id FROM plan_policy_versions
           WHERE id = $1 AND plan_key = $2 AND lifecycle = 'active'`,
          [input.policyVersionId, input.planKey],
        );
        if (!policy.rowCount) throw new BadRequestException("Active plan policy was not found");
        const result = await client.query(
          `INSERT INTO tenant_plan_assignments (
             tenant_id, plan_key, plan_policy_version_id, effective_from,
             reason, created_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, state, effective_from, created_at`,
          [tenantId, input.planKey, input.policyVersionId, input.effectiveFrom,
            reason, principal.userId, correlation(correlationId)],
        ).catch((error: unknown) => {
          if ((error as { code?: string }).code === "23505") {
            throw new ConflictException("Tenant already has a scheduled plan assignment");
          }
          throw error;
        });
        let response = camel(result.rows[0]);
        if (new Date(input.effectiveFrom).getTime() <= Date.now()) {
          const applied = await client.query(
            `SELECT app.apply_tenant_plan_assignment($1,$2) result`,
            [result.rows[0].id, principal.userId],
          );
          response = applied.rows[0].result as Record<string, unknown>;
        }
        await this.audit.append(client, {
          eventType: "commercial.tenant-plan.scheduled",
          actorId: principal.userId,
          resourceType: "tenant-plan-assignment",
          resourceId: result.rows[0].id,
          correlationId: correlation(correlationId),
          metadata: { tenantId, planKey: input.planKey, policyVersionId: input.policyVersionId, effectiveFrom: input.effectiveFrom, reason },
        });
        return response;
      },
    );
  }
}
