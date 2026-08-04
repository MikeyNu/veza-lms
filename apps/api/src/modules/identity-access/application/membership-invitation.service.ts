import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import type { BaselineRoleKey, MembershipId, TenantId, UserId } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { isPostgresError } from "../../../platform/database/database.types.js";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import type { ExternalPrincipal } from "../../../platform/authentication/external-principal.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import { InvitationTokenService } from "../security/invitation-token.service.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";

interface InvitationRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly role_key: BaselineRoleKey;
  readonly scope_type: "tenant";
  readonly scope_id: string;
  readonly status: string;
  readonly token_digest: string | null;
  readonly expires_at: Date;
  readonly invited_by: string;
}

interface UserIdRow extends QueryResultRow {
  readonly id: string;
}

interface MembershipIdRow extends QueryResultRow {
  readonly id: string;
}

export interface InvitationQueued {
  readonly invitationId: string;
  readonly deliveryStatus: "queued";
  readonly expiresAt: string;
}

export interface InvitationAccepted {
  readonly tenantId: TenantId;
  readonly membershipId: MembershipId;
  readonly status: "active";
}

@Injectable()
export class MembershipInvitationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
    private readonly authorization: TenantAuthorizationService,
    private readonly tokens: InvitationTokenService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async inviteTenantOwner(request: AuthenticatedRequest, email: string, expiresInDays: number): Promise<InvitationQueued> {
    const context = this.tenantContext.require();
    const resource = this.authorization.buildTenantResource();
    this.authorization.assertCanDelegate(request, "tenant-owner", resource);

    const invitationId = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
    const secret = this.tokens.create();
    const normalizedEmail = email.trim().toLowerCase();

    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      try {
        await client.query(
          `INSERT INTO membership_invitations (
             id, tenant_id, email, role_key, scope_type, scope_id,
             status, token_digest, expires_at, invited_by
           ) VALUES ($1,$2,$3,'tenant-owner','tenant',$2,'pending-delivery',$4,$5,$6)`,
          [invitationId, context.tenantId, normalizedEmail, secret.tokenDigest, expiresAt, context.actorId],
        );
      } catch (error) {
        if (isPostgresError(error, "23505", "membership_invitations_open_email_idx")) {
          throw new ConflictException("An active invitation already exists for this tenant owner");
        }
        throw error;
      }

      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.invitation.created",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "membership-invitation",
        resourceId: invitationId,
        purpose: "tenant administration",
        correlationId: context.correlationId,
        afterState: { email: normalizedEmail, role: "tenant-owner", status: "pending-delivery" },
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
        payload: {
          invitationId,
          email: normalizedEmail,
          role: "tenant-owner",
          expiresAt: expiresAt.toISOString(),
          encryptedToken: secret.encryptedToken,
        },
      });

      return { invitationId, deliveryStatus: "queued", expiresAt: expiresAt.toISOString() };
    });
  }

  async accept(
    external: ExternalPrincipal,
    invitationId: string,
    rawToken: string,
    correlationId: string,
  ): Promise<InvitationAccepted> {
    const externalEmail = external.email?.trim().toLowerCase();
    if (!externalEmail) throw new ForbiddenException("The identity provider must supply a verified email address");

    return this.database.withControlPlaneTransaction(async (client) => {
      const invitationResult = await client.query<InvitationRow>(
        `SELECT id, tenant_id, email, role_key, scope_type, scope_id, status, token_digest, expires_at, invited_by
         FROM membership_invitations
         WHERE id = $1
         FOR UPDATE`,
        [invitationId],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) throw new NotFoundException("Invitation was not found");
      if (invitation.status === "accepted") throw new ConflictException("Invitation has already been accepted");
      if (!["pending-delivery", "sent"].includes(invitation.status)) throw new GoneException("Invitation is no longer active");
      if (invitation.expires_at.getTime() <= Date.now()) throw new GoneException("Invitation has expired");
      if (!invitation.token_digest || !this.tokens.matches(rawToken, invitation.token_digest)) {
        throw new ForbiddenException("Invitation token is invalid");
      }
      if (invitation.email.toLowerCase() !== externalEmail) {
        throw new ForbiddenException("Invitation does not belong to this identity");
      }

      const userResult = await client.query<UserIdRow>(
        `INSERT INTO users (identity_issuer, identity_subject, email, display_name)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (identity_issuer, identity_subject)
         DO UPDATE SET email = EXCLUDED.email, display_name = COALESCE(EXCLUDED.display_name, users.display_name), updated_at = now()
         RETURNING id`,
        [external.issuer, external.subject, externalEmail, external.displayName ?? null],
      );
      const userId = userResult.rows[0]?.id as UserId | undefined;
      if (!userId) throw new Error("Identity record could not be created");

      const membershipResult = await client.query<MembershipIdRow>(
        `INSERT INTO memberships (tenant_id, user_id, status)
         VALUES ($1,$2,'active')
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET status = 'active', valid_until = NULL, updated_at = now()
         RETURNING id`,
        [invitation.tenant_id, userId],
      );
      const membershipId = membershipResult.rows[0]?.id as MembershipId | undefined;
      if (!membershipId) throw new Error("Membership could not be created");

      await client.query(
        `INSERT INTO role_assignments (
           tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id, membership_id, role_key, scope_type, scope_id)
         DO NOTHING`,
        [invitation.tenant_id, membershipId, invitation.role_key, invitation.scope_type, invitation.scope_id, invitation.invited_by],
      );
      await client.query(
        `UPDATE membership_invitations
         SET status = 'accepted', accepted_by_user_id = $2, token_digest = NULL, updated_at = now()
         WHERE id = $1`,
        [invitation.id, userId],
      );

      const tenantId = invitation.tenant_id as TenantId;
      await this.audit.append(client, {
        tenantId,
        plane: "control",
        eventType: "membership.invitation.accepted",
        actorId: userId,
        membershipId,
        resourceType: "membership",
        resourceId: membershipId,
        correlationId,
        afterState: { status: "active", role: invitation.role_key },
      });
      await this.outbox.append(client, {
        tenantId,
        eventName: "identity.membership.activated",
        eventVersion: 1,
        aggregateType: "membership",
        aggregateId: membershipId,
        aggregateVersion: 1,
        actorId: userId,
        correlationId,
        payload: { membershipId, userId, role: invitation.role_key },
      });

      return { tenantId, membershipId, status: "active" };
    });
  }
}
