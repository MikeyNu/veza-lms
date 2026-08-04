import { ForbiddenException, Injectable } from "@nestjs/common";
import { assignmentsForRole, type PolicyAssignment, type PolicyConditions } from "@veza/authz";
import type {
  AuthenticatedPrincipal,
  BaselineRoleKey,
  EntitlementSummary,
  InstitutionId,
  MembershipId,
  MembershipStatus,
  TenantId,
  TenantModuleKey,
  TenantStatus,
  UserId,
  WorkspaceOption,
  WorkspaceSession,
} from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type { ExternalPrincipal } from "../../../platform/authentication/external-principal.js";
import { hasPlatformOperatorAssurance } from "../../../platform/authentication/platform-operator-assurance.js";
import type { ResolvedWorkspaceSession } from "../application/session.types.js";

interface UserRow extends QueryResultRow {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly status: string;
}

interface MembershipRow extends QueryResultRow {
  readonly membership_id: string;
  readonly membership_status: MembershipStatus;
  readonly membership_locale: string;
  readonly membership_timezone: string;
  readonly tenant_id: string;
  readonly tenant_slug: string;
  readonly tenant_display_name: string;
  readonly tenant_status: TenantStatus;
  readonly deployment_tier: "shared" | "protected" | "sovereign";
  readonly residency_region: string;
  readonly plan_key: string;
  readonly tenant_locale: string;
  readonly tenant_timezone: string;
  readonly logo_url: string | null;
}

interface WorkspaceOptionRow extends QueryResultRow {
  readonly membership_id: string;
  readonly tenant_id: string;
  readonly tenant_slug: string;
  readonly tenant_display_name: string;
  readonly tenant_status: TenantStatus;
  readonly logo_url: string | null;
  readonly roles: BaselineRoleKey[];
}

interface RoleRow extends QueryResultRow {
  readonly role_key: BaselineRoleKey;
  readonly scope_type: PolicyAssignment["scopeType"];
  readonly scope_id: string;
  readonly conditions: PolicyConditions;
}

interface EntitlementRow extends QueryResultRow {
  readonly module_key: TenantModuleKey;
  readonly state: EntitlementSummary["state"];
  readonly limits: Readonly<Record<string, number | string | boolean>>;
  readonly valid_until: Date | null;
}

@Injectable()
export class IdentitySessionRepository {
  constructor(private readonly database: DatabaseService) {}

  async findPrincipal(
    external: ExternalPrincipal,
    correlationId: string,
  ): Promise<AuthenticatedPrincipal | undefined> {
    const platformOperator = hasPlatformOperatorAssurance(external);
    const result = platformOperator
      ? await this.database.withControlPlaneTransaction(async (client) => {
          const inserted = await client.query<UserRow>(
            `INSERT INTO users (identity_issuer, identity_subject, email, display_name)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (identity_issuer, identity_subject) DO NOTHING
             RETURNING id, email, display_name, status`,
            [external.issuer, external.subject, external.email ?? null, external.displayName ?? null],
          );
          const created = inserted.rows[0];
          if (created) {
            await client.query(
              `INSERT INTO platform_audit_events (
                 event_type, actor_id, resource_type, resource_id, correlation_id, metadata
               ) VALUES ('platform-operator.identity-created',$1,'user',$1,$2,$3)`,
              [created.id, correlationId, { issuer: external.issuer, subject: external.subject }],
            );
            return inserted;
          }
          return client.query<UserRow>(
            `UPDATE users
             SET email = COALESCE($3, email),
                 display_name = COALESCE($4, display_name),
                 updated_at = now()
             WHERE identity_issuer = $1
               AND identity_subject = $2
               AND status = 'active'
             RETURNING id, email, display_name, status`,
            [external.issuer, external.subject, external.email ?? null, external.displayName ?? null],
          );
        })
      : await this.database.controlPlaneQuery<UserRow>(
          `SELECT id, email, display_name, status
           FROM users
           WHERE identity_issuer = $1 AND identity_subject = $2`,
          [external.issuer, external.subject],
        );
    const user = result.rows[0];
    if (!user || user.status !== "active") return undefined;

    const email = user.email ?? external.email;
    const displayName = user.display_name ?? external.displayName;
    return {
      userId: user.id as UserId,
      subject: external.subject,
      ...(email ? { email } : {}),
      ...(displayName ? { displayName } : {}),
      platformRoles: external.platformRoles,
      authenticationMethods: external.authenticationMethods,
      issuedAt: external.issuedAt,
    };
  }

  async listWorkspaces(principal: AuthenticatedPrincipal): Promise<readonly WorkspaceOption[]> {
    const result = await this.database.controlPlaneQuery<WorkspaceOptionRow>(
      `SELECT
         m.id AS membership_id,
         t.id AS tenant_id,
         t.slug AS tenant_slug,
         t.display_name AS tenant_display_name,
         t.status AS tenant_status,
         NULLIF(t.branding->>'logoUrl', '') AS logo_url,
         COALESCE(array_agg(DISTINCT ra.role_key) FILTER (WHERE ra.role_key IS NOT NULL), '{}') AS roles
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       LEFT JOIN role_assignments ra
         ON ra.tenant_id = m.tenant_id
        AND ra.membership_id = m.id
        AND ra.valid_from <= now()
        AND (ra.valid_until IS NULL OR ra.valid_until > now())
       WHERE m.user_id = $1
         AND m.status = 'active'
         AND m.valid_from <= now()
         AND (m.valid_until IS NULL OR m.valid_until > now())
         AND t.status IN ('provisioning', 'active')
       GROUP BY m.id, t.id, t.slug, t.display_name, t.status, t.branding
       HAVING count(ra.id) > 0
       ORDER BY t.display_name ASC, m.id ASC`,
      [principal.userId],
    );

    return result.rows.map((row) => ({
      membershipId: row.membership_id as MembershipId,
      tenant: {
        id: row.tenant_id as TenantId,
        slug: row.tenant_slug,
        displayName: row.tenant_display_name,
        status: row.tenant_status,
        ...(row.logo_url ? { logoUrl: row.logo_url } : {}),
      },
      roles: row.roles,
      label: row.roles.includes("learner") && row.roles.length === 1
        ? "Learner workspace"
        : row.roles.includes("instructor")
          ? "Teaching workspace"
          : "Institution workspace",
    }));
  }

  async resolveWorkspace(principal: AuthenticatedPrincipal, membershipId: MembershipId): Promise<ResolvedWorkspaceSession> {
    const membershipResult = await this.database.controlPlaneQuery<MembershipRow>(
      `SELECT
         m.id AS membership_id,
         m.status AS membership_status,
         m.locale AS membership_locale,
         m.timezone AS membership_timezone,
         t.id AS tenant_id,
         t.slug AS tenant_slug,
         t.display_name AS tenant_display_name,
         t.status AS tenant_status,
         t.deployment_tier,
         t.residency_region,
         t.plan_key,
         t.locale AS tenant_locale,
         t.timezone AS tenant_timezone,
         NULLIF(t.branding->>'logoUrl', '') AS logo_url
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.id = $1
         AND m.user_id = $2
         AND m.status = 'active'
         AND m.valid_from <= now()
         AND (m.valid_until IS NULL OR m.valid_until > now())
         AND t.status IN ('provisioning', 'active')`,
      [membershipId, principal.userId],
    );
    const membership = membershipResult.rows[0];
    if (!membership) throw new ForbiddenException("The selected membership is not available");

    const [rolesResult, entitlementsResult] = await Promise.all([
      this.database.controlPlaneQuery<RoleRow>(
        `SELECT role_key, scope_type, scope_id, conditions
         FROM role_assignments
         WHERE tenant_id = $1
           AND membership_id = $2
           AND valid_from <= now()
           AND (valid_until IS NULL OR valid_until > now())`,
        [membership.tenant_id, membership.membership_id],
      ),
      this.database.controlPlaneQuery<EntitlementRow>(
        `SELECT module_key, state, limits, valid_until
         FROM tenant_entitlements
         WHERE tenant_id = $1
           AND state IN ('enabled', 'trial')
           AND valid_from <= now()
           AND (valid_until IS NULL OR valid_until > now())`,
        [membership.tenant_id],
      ),
    ]);

    const roles = [...new Set(rolesResult.rows.map((row) => row.role_key))];
    const institutionIds = [...new Set(
      rolesResult.rows
        .filter((row) => row.scope_type === "institution")
        .map((row) => row.scope_id as InstitutionId),
    )];
    const entitlements: readonly EntitlementSummary[] = entitlementsResult.rows.map((row) => ({
      module: row.module_key,
      state: row.state,
      limits: row.limits,
      ...(row.valid_until ? { validUntil: row.valid_until.toISOString() } : {}),
    }));
    if (roles.length === 0) throw new ForbiddenException("The selected membership has no active role assignment");
    if (!entitlements.some((entitlement) => entitlement.module === "core")) {
      throw new ForbiddenException("The selected workspace does not have an active core entitlement");
    }

    const workspace: WorkspaceSession = {
      principal: {
        userId: principal.userId,
        ...(principal.displayName ? { displayName: principal.displayName } : {}),
        ...(principal.email ? { email: principal.email } : {}),
      },
      tenant: {
        id: membership.tenant_id as TenantId,
        slug: membership.tenant_slug,
        displayName: membership.tenant_display_name,
        status: membership.tenant_status,
        deploymentTier: membership.deployment_tier,
        residencyRegion: membership.residency_region,
        planKey: membership.plan_key,
        locale: membership.tenant_locale,
        timezone: membership.tenant_timezone,
        ...(membership.logo_url ? { logoUrl: membership.logo_url } : {}),
      },
      membership: {
        id: membership.membership_id as MembershipId,
        status: membership.membership_status,
        roles,
        institutionIds,
        locale: membership.membership_locale,
        timezone: membership.membership_timezone,
      },
      entitlements,
    };

    const policyAssignments = rolesResult.rows.flatMap((row) =>
      assignmentsForRole(row.role_key, row.scope_type, row.scope_id).map((assignment) => ({
        ...assignment,
        ...(Object.keys(row.conditions).length > 0 ? { conditions: row.conditions } : {}),
      })),
    );

    return { principal, workspace, policyAssignments };
  }
}
