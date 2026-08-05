import { ConflictException, Injectable } from "@nestjs/common";
import type {
  ActivationCheck,
  InstitutionId,
  InstitutionType,
  InstitutionalPolicyKey,
  TenantActivationReadiness,
  TenantStatus,
} from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

interface TenantRow extends QueryResultRow { readonly status: TenantStatus; }
interface CountRow extends QueryResultRow { readonly count: number; }
interface InstitutionReadinessRow extends QueryResultRow {
  readonly id: string;
  readonly display_name: string;
  readonly institution_type: InstitutionType;
  readonly primary_campuses: number;
  readonly published_periods: number;
  readonly approved_policies: InstitutionalPolicyKey[];
}

const basePolicies: readonly InstitutionalPolicyKey[] = [
  "privacy",
  "data-retention",
  "acceptable-use",
  "support-escalation",
];

function check(
  key: string,
  label: string,
  passed: boolean,
  detail: string,
  institutionId?: InstitutionId,
): ActivationCheck {
  return {
    key,
    label,
    passed,
    blocking: true,
    detail,
    ...(institutionId ? { institutionId } : {}),
  };
}

@Injectable()
export class TenantActivationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async readiness(): Promise<TenantActivationReadiness> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, (client) => this.evaluate(client));
  }

  async activate(): Promise<TenantActivationReadiness> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const readiness = await this.evaluate(client, true);
      if (!readiness.ready) {
        const failed = readiness.checks.filter((item) => item.blocking && !item.passed).map((item) => item.label);
        throw new ConflictException({
          message: "Tenant activation requirements are not satisfied",
          failedChecks: failed,
        });
      }

      const updated = await client.query<TenantRow>(
        `UPDATE tenants
         SET status = 'active', updated_at = now()
         WHERE id = $1 AND status = 'provisioning'
         RETURNING status`,
        [context.tenantId],
      );
      if (updated.rowCount !== 1) throw new ConflictException("Tenant status changed before activation completed");

      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "tenant.activated",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "tenant",
        resourceId: context.tenantId,
        purpose: "institution launch",
        correlationId: context.correlationId,
        beforeState: { status: "provisioning" },
        afterState: { status: "active", checks: readiness.checks },
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "tenant.activated",
        eventVersion: 1,
        aggregateType: "tenant",
        aggregateId: context.tenantId,
        aggregateVersion: 2,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: { tenantId: context.tenantId, activatedAt: new Date().toISOString() },
      });

      return {
        ...readiness,
        tenantStatus: "active",
        ready: false,
        evaluatedAt: new Date().toISOString(),
      };
    });
  }

  private async evaluate(client: PoolClient, lockTenant = false): Promise<TenantActivationReadiness> {
    const context = this.tenantContext.require();
    const tenantResult = await client.query<TenantRow>(
      `SELECT status FROM tenants WHERE id = $1${lockTenant ? " FOR UPDATE" : ""}`,
      [context.tenantId],
    );
    const tenantStatus = tenantResult.rows[0]?.status;
    if (!tenantStatus) throw new Error("Tenant was not found inside its own RLS context");

    const [profile, core, owner, institutions] = await Promise.all([
      client.query<CountRow>(`SELECT count(*)::int AS count FROM tenant_setup_profiles WHERE tenant_id = $1`, [context.tenantId]),
      client.query<CountRow>(
        `SELECT count(*)::int AS count FROM tenant_entitlements
         WHERE tenant_id = $1 AND module_key = 'core' AND state IN ('enabled','trial')
           AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())`,
        [context.tenantId],
      ),
      client.query<CountRow>(
        `SELECT count(DISTINCT m.id)::int AS count
         FROM memberships m
         JOIN role_assignments ra ON ra.tenant_id = m.tenant_id AND ra.membership_id = m.id
         WHERE m.tenant_id = $1 AND m.status = 'active'
           AND m.valid_from <= now() AND (m.valid_until IS NULL OR m.valid_until > now())
           AND ra.role_key = 'tenant-owner' AND ra.scope_type = 'tenant' AND ra.scope_id = $1
           AND ra.valid_from <= now() AND (ra.valid_until IS NULL OR ra.valid_until > now())`,
        [context.tenantId],
      ),
      client.query<InstitutionReadinessRow>(
        `SELECT
           i.id,
           i.display_name,
           i.institution_type,
           count(DISTINCT c.id) FILTER (
             WHERE c.status = 'active' AND c.is_primary = true
           )::int AS primary_campuses,
           count(DISTINCT ap.id) FILTER (
             WHERE ap.status = 'published' AND ap.ends_on >= current_date
           )::int AS published_periods,
           COALESCE(array_agg(DISTINCT p.policy_key) FILTER (
             WHERE p.status = 'approved'
               AND p.effective_from <= current_date
               AND (p.effective_until IS NULL OR p.effective_until >= current_date)
           ), '{}') AS approved_policies
         FROM institutions i
         LEFT JOIN campuses c ON c.tenant_id = i.tenant_id AND c.institution_id = i.id
         LEFT JOIN academic_periods ap ON ap.tenant_id = i.tenant_id AND ap.institution_id = i.id
         LEFT JOIN institutional_policies p ON p.tenant_id = i.tenant_id AND p.institution_id = i.id
         WHERE i.tenant_id = $1 AND i.status = 'active'
         GROUP BY i.id, i.display_name, i.institution_type
         ORDER BY i.display_name`,
        [context.tenantId],
      ),
    ]);

    const checks: ActivationCheck[] = [
      check(
        "tenant-status",
        "Tenant is in provisioning state",
        tenantStatus === "provisioning",
        tenantStatus === "provisioning" ? "Tenant is eligible for activation." : `Current status is ${tenantStatus}.`,
      ),
      check(
        "setup-profile",
        "Operational setup profile is configured",
        (profile.rows[0]?.count ?? 0) === 1,
        (profile.rows[0]?.count ?? 0) === 1 ? "Identity, support, privacy and retention settings are present." : "Configure identity mode, support and privacy contacts, retention and support SLA.",
      ),
      check(
        "core-entitlement",
        "Core entitlement is active",
        (core.rows[0]?.count ?? 0) === 1,
        (core.rows[0]?.count ?? 0) === 1 ? "Core learning operations are licensed." : "Enable the mandatory core entitlement.",
      ),
      check(
        "tenant-owner",
        "An accountable tenant owner is active",
        (owner.rows[0]?.count ?? 0) > 0,
        (owner.rows[0]?.count ?? 0) > 0 ? "At least one active tenant-scoped owner exists." : "Accept a tenant-owner invitation before launch.",
      ),
      check(
        "institution-count",
        "At least one active institution exists",
        institutions.rows.length > 0,
        institutions.rows.length > 0 ? `${institutions.rows.length} active institution(s) configured.` : "Create an institution before launch.",
      ),
    ];

    for (const institution of institutions.rows) {
      const institutionId = institution.id as InstitutionId;
      checks.push(check(
        `institution:${institution.id}:primary-campus`,
        `${institution.display_name} has one primary active campus`,
        institution.primary_campuses === 1,
        institution.primary_campuses === 1 ? "Primary delivery context is defined." : "Select exactly one primary active physical, virtual or hybrid campus.",
        institutionId,
      ));
      checks.push(check(
        `institution:${institution.id}:academic-period`,
        `${institution.display_name} has a published academic period`,
        institution.published_periods > 0,
        institution.published_periods > 0 ? "A current or future period is published." : "Publish a current or future academic period.",
        institutionId,
      ));
      const requiredPolicies = institution.institution_type === "school"
        ? [...basePolicies, "safeguarding" as const]
        : basePolicies;
      const missingPolicies = requiredPolicies.filter((policy) => !institution.approved_policies.includes(policy));
      checks.push(check(
        `institution:${institution.id}:policies`,
        `${institution.display_name} has required approved policies`,
        missingPolicies.length === 0,
        missingPolicies.length === 0 ? "Required policy set is effective." : `Approve: ${missingPolicies.join(", ")}.`,
        institutionId,
      ));
    }

    const ready = tenantStatus === "provisioning" && checks.every((item) => !item.blocking || item.passed);
    return {
      tenantId: context.tenantId,
      tenantStatus,
      ready,
      checks,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
