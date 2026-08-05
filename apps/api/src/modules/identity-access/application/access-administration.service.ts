import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { permissions, type ResourceScope } from "@veza/authz";
import type {
  BaselineRoleKey,
  MembershipId,
  MembershipStatus,
  RoleAssignmentId,
} from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { isPostgresError } from "../../../platform/database/database.types.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import { InvitationTokenService } from "../security/invitation-token.service.js";
import type {
  AssignRoleDto,
  ChangeMembershipStatusDto,
  CreateAccessInvitationDto,
} from "./access-administration.dto.js";

interface MembershipRow extends QueryResultRow {
  readonly id: string;
  readonly status: MembershipStatus;
}

interface AssignmentRow extends QueryResultRow {
  readonly id: string;
  readonly membership_id: string;
  readonly role_key: BaselineRoleKey;
  readonly scope_type: "tenant" | "institution";
  readonly scope_id: string;
  readonly valid_until: Date | null;
}

interface InvitationRow extends QueryResultRow {
  readonly id: string;
  readonly role_key: BaselineRoleKey;
  readonly scope_type: "tenant" | "institution";
  readonly scope_id: string;
  readonly status: string;
}

export interface AccessInvitationQueued {
  readonly invitationId: string;
  readonly roleKey: BaselineRoleKey;
  readonly scopeType: "tenant" | "institution";
  readonly scopeId: string;
  readonly expiresAt: string;
  readonly deliveryStatus: "queued";
}

export interface RoleAssignmentCreated {
  readonly assignmentId: RoleAssignmentId;
  readonly membershipId: MembershipId;
  readonly roleKey: BaselineRoleKey;
  readonly scopeType: "tenant" | "institution";
  readonly scopeId: string;
  readonly validUntil?: string;
}

function trimmedReason(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

@Injectable()
export class AccessAdministrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
    private readonly authorization: TenantAuthorizationService,
    private readonly tokens: InvitationTokenService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createInvitation(request: AuthenticatedRequest, input: CreateAccessInvitationDto): Promise<AccessInvitationQueued> {
    const context = this.tenantContext.require();
    const resource = this.resource(input.scopeType, input.scopeId);
    this.authorization.assertPermission(request, permissions.membershipInvite, resource);
    this.authorization.assertCanDelegate(request, input.roleKey, resource);
    const normalizedEmail = input.email.trim().toLowerCase();
    const invitationId = randomUUID();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    const secret = this.tokens.create();

    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.assertScopeExists(client, input.scopeType, input.scopeId);
      try {
        await client.query(
          `INSERT INTO membership_invitations (
             id, tenant_id, email, role_key, scope_type, scope_id,
             status, token_digest, expires_at, invited_by
           ) VALUES ($1,$2,$3,$4,$5,$6,'pending-delivery',$7,$8,$9)`,
          [invitationId, context.tenantId, normalizedEmail, input.roleKey, input.scopeType,
            input.scopeId, secret.tokenDigest, expiresAt, context.actorId],
        );
      } catch (error) {
        if (isPostgresError(error, "23505", "membership_invitations_open_email_idx")) {
          throw new ConflictException("An active invitation already exists for this identity, role and scope");
        }
        throw error;
      }
      const evidence = {
        email: normalizedEmail,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        status: "pending-delivery",
        expiresAt: expiresAt.toISOString(),
      };
      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.invitation.created",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "membership-invitation",
        resourceId: invitationId,
        purpose: "access administration",
        correlationId: context.correlationId,
        afterState: evidence,
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "identity.membership-invitation.requested",
        eventVersion: 1,
        aggregateType: "membership-invitation",
        aggregateId: invitationId,
        aggregateVersion: 1,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: { ...evidence, invitationId, encryptedToken: secret.encryptedToken },
      });
      return {
        invitationId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        expiresAt: expiresAt.toISOString(),
        deliveryStatus: "queued",
      };
    });
  }

  async assignRole(
    request: AuthenticatedRequest,
    membershipId: MembershipId,
    input: AssignRoleDto,
  ): Promise<RoleAssignmentCreated> {
    const context = this.tenantContext.require();
    const resource = this.resource(input.scopeType, input.scopeId);
    this.authorization.assertPermission(request, permissions.membershipRoleAssign, resource);
    this.authorization.assertCanDelegate(request, input.roleKey, resource);
    const validUntil = input.validUntil ? new Date(input.validUntil) : undefined;
    if (validUntil && validUntil.getTime() <= Date.now()) throw new BadRequestException("Role validity must end in the future");

    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.assertScopeExists(client, input.scopeType, input.scopeId);
      const membership = await this.requireMembership(client, membershipId, true);
      if (membership.status !== "active") throw new ConflictException("Roles can be assigned only to an active membership");
      const assignmentId = randomUUID() as RoleAssignmentId;
      try {
        await client.query(
          `INSERT INTO role_assignments (
             id, tenant_id, membership_id, role_key, scope_type, scope_id,
             valid_until, assigned_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [assignmentId, context.tenantId, membershipId, input.roleKey, input.scopeType,
            input.scopeId, validUntil ?? null, context.actorId],
        );
      } catch (error) {
        if (isPostgresError(error, "23P01") || isPostgresError(error, "23505")) {
          throw new ConflictException("This membership already has an overlapping role assignment in the selected scope");
        }
        throw error;
      }
      const evidence = {
        membershipId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        ...(validUntil ? { validUntil: validUntil.toISOString() } : {}),
      };
      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.role-assigned",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "role-assignment",
        resourceId: assignmentId,
        purpose: "access administration",
        correlationId: context.correlationId,
        afterState: evidence,
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "identity.membership-role.assigned",
        eventVersion: 1,
        aggregateType: "role-assignment",
        aggregateId: assignmentId,
        aggregateVersion: 1,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: evidence,
      });
      return { assignmentId, membershipId, roleKey: input.roleKey, scopeType: input.scopeType, scopeId: input.scopeId, ...(validUntil ? { validUntil: validUntil.toISOString() } : {}) };
    });
  }

  async endRole(request: AuthenticatedRequest, assignmentId: RoleAssignmentId, reason: string): Promise<{ readonly status: "ended" }> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<AssignmentRow>(
        `SELECT id, membership_id, role_key, scope_type, scope_id, valid_until
         FROM role_assignments
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [context.tenantId, assignmentId],
      );
      const assignment = result.rows[0];
      if (!assignment) throw new NotFoundException("Role assignment was not found");
      if (assignment.valid_until && assignment.valid_until.getTime() <= Date.now()) throw new ConflictException("Role assignment has already ended");
      const resource = this.resource(assignment.scope_type, assignment.scope_id);
      this.authorization.assertPermission(request, permissions.membershipRoleAssign, resource);
      this.authorization.assertCanDelegate(request, assignment.role_key, resource);
      if (assignment.role_key === "tenant-owner") await this.assertAnotherActiveTenantOwner(client, assignment.membership_id, assignment.id);
      const endedAt = new Date();
      await client.query(
        `UPDATE role_assignments
         SET valid_until = $3, ended_at = $3, ended_by = $4, end_reason = $5
         WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, assignmentId, endedAt, context.actorId, trimmedReason(reason)],
      );
      const evidence = { membershipId: assignment.membership_id, roleKey: assignment.role_key, scopeType: assignment.scope_type, scopeId: assignment.scope_id, endedAt: endedAt.toISOString(), reason: trimmedReason(reason) };
      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.role-ended",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "role-assignment",
        resourceId: assignmentId,
        purpose: "access administration",
        correlationId: context.correlationId,
        afterState: evidence,
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "identity.membership-role.ended",
        eventVersion: 1,
        aggregateType: "role-assignment",
        aggregateId: assignmentId,
        aggregateVersion: 2,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: evidence,
      });
      return { status: "ended" };
    });
  }

  async changeMembershipStatus(
    request: AuthenticatedRequest,
    membershipId: MembershipId,
    input: ChangeMembershipStatusDto,
  ): Promise<{ readonly membershipId: MembershipId; readonly status: MembershipStatus }> {
    const context = this.tenantContext.require();
    const resource = this.authorization.buildTenantResource();
    this.authorization.assertPermission(request, permissions.membershipRoleAssign, resource);
    if (!request.workspaceSession?.membership.roles.includes("tenant-owner")) {
      throw new ForbiddenException("Only a tenant owner can change tenant membership status");
    }
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const membership = await this.requireMembership(client, membershipId, true);
      if (membership.status === input.status) throw new ConflictException("Membership already has the selected status");
      if (input.status !== "active") await this.assertAnotherActiveTenantOwner(client, membershipId);
      const reason = trimmedReason(input.reason);
      await client.query(
        `UPDATE memberships
         SET status = $3,
             valid_until = CASE WHEN $3 = 'revoked' THEN now() ELSE valid_until END,
             updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, membershipId, input.status],
      );
      const evidence = { previousStatus: membership.status, status: input.status, reason };
      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.status-changed",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "membership",
        resourceId: membershipId,
        purpose: "access administration",
        correlationId: context.correlationId,
        beforeState: { status: membership.status },
        afterState: { status: input.status, reason },
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "identity.membership.status-changed",
        eventVersion: 1,
        aggregateType: "membership",
        aggregateId: membershipId,
        aggregateVersion: 1,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: { membershipId, ...evidence },
      });
      return { membershipId, status: input.status };
    });
  }

  async revokeInvitation(request: AuthenticatedRequest, invitationId: string, reason: string): Promise<{ readonly status: "revoked" }> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<InvitationRow>(
        `SELECT id, role_key, scope_type, scope_id, status
         FROM membership_invitations
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [context.tenantId, invitationId],
      );
      const invitation = result.rows[0];
      if (!invitation) throw new NotFoundException("Invitation was not found");
      if (!["pending-delivery", "sent"].includes(invitation.status)) throw new ConflictException("Invitation is no longer active");
      const resource = this.resource(invitation.scope_type, invitation.scope_id);
      this.authorization.assertPermission(request, permissions.membershipInvite, resource);
      this.authorization.assertCanDelegate(request, invitation.role_key, resource);
      const normalizedReason = trimmedReason(reason);
      await client.query(
        `UPDATE membership_invitations
         SET status = 'revoked', token_digest = NULL, updated_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, invitationId],
      );
      const evidence = { roleKey: invitation.role_key, scopeType: invitation.scope_type, scopeId: invitation.scope_id, reason: normalizedReason };
      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.invitation.revoked",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "membership-invitation",
        resourceId: invitationId,
        purpose: "access administration",
        correlationId: context.correlationId,
        afterState: evidence,
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "identity.membership-invitation.revoked",
        eventVersion: 1,
        aggregateType: "membership-invitation",
        aggregateId: invitationId,
        aggregateVersion: 2,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: { invitationId, ...evidence },
      });
      return { status: "revoked" };
    });
  }

  private resource(scopeType: "tenant" | "institution", scopeId: string): ResourceScope {
    const context = this.tenantContext.require();
    if (scopeType === "tenant") {
      if (scopeId !== context.tenantId) throw new BadRequestException("Tenant role scope must match the active workspace");
      return this.authorization.buildTenantResource();
    }
    return this.authorization.buildInstitutionResource(scopeId);
  }

  private async assertScopeExists(client: PoolClient, scopeType: "tenant" | "institution", scopeId: string): Promise<void> {
    const context = this.tenantContext.require();
    if (scopeType === "tenant") {
      if (scopeId !== context.tenantId) throw new BadRequestException("Tenant role scope must match the active workspace");
      return;
    }
    const result = await client.query(
      `SELECT 1 FROM institutions
       WHERE tenant_id = $1 AND id = $2 AND status <> 'archived'`,
      [context.tenantId, scopeId],
    );
    if (result.rowCount === 0) throw new NotFoundException("Institution scope was not found in this tenant");
  }

  private async requireMembership(client: PoolClient, membershipId: MembershipId, lock: boolean): Promise<MembershipRow> {
    const context = this.tenantContext.require();
    const result = await client.query<MembershipRow>(
      `SELECT id, status FROM memberships
       WHERE tenant_id = $1 AND id = $2
       ${lock ? "FOR UPDATE" : ""}`,
      [context.tenantId, membershipId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Membership was not found");
    return row;
  }

  private async assertAnotherActiveTenantOwner(
    client: PoolClient,
    excludedMembershipId: string,
    excludedAssignmentId?: string,
  ): Promise<void> {
    const context = this.tenantContext.require();
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`tenant-owner:${context.tenantId}`]);
    const result = await client.query(
      `SELECT count(*)::int AS owners
       FROM role_assignments role
       JOIN memberships membership
         ON membership.tenant_id = role.tenant_id
        AND membership.id = role.membership_id
       WHERE role.tenant_id = $1
         AND role.role_key = 'tenant-owner'
         AND role.scope_type = 'tenant'
         AND role.scope_id = $1
         AND role.valid_from <= now()
         AND (role.valid_until IS NULL OR role.valid_until > now())
         AND membership.status = 'active'
         AND membership.id <> $2
         AND ($3::uuid IS NULL OR role.id <> $3::uuid)`,
      [context.tenantId, excludedMembershipId, excludedAssignmentId ?? null],
    );
    if (Number(result.rows[0]?.owners ?? 0) < 1) {
      throw new ConflictException("The tenant must retain at least one active tenant owner");
    }
  }
}
