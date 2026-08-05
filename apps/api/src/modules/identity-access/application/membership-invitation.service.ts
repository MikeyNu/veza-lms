import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import type { BaselineRoleKey, MembershipId, TenantId, UserId } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import type { ExternalPrincipal } from "../../../platform/authentication/external-principal.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import { InvitationTokenService } from "../security/invitation-token.service.js";
import { AccessAdministrationService } from "./access-administration.service.js";
import { PersonIdentityAcceptanceService } from "./person-identity-acceptance.service.js";

interface InvitationRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly role_key: BaselineRoleKey;
  readonly scope_type: "tenant" | "institution";
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
    private readonly accessAdministration: AccessAdministrationService,
    private readonly tokens: InvitationTokenService,
    private readonly identityAcceptance: PersonIdentityAcceptanceService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async inviteTenantOwner(
    request: AuthenticatedRequest,
    email: string,
    expiresInDays: number,
  ): Promise<InvitationQueued> {
    const context = this.tenantContext.require();
    const result = await this.accessAdministration.createInvitation(request, {
      email,
      roleKey: "tenant-owner",
      scopeType: "tenant",
      scopeId: context.tenantId,
      expiresInDays,
    });
    return {
      invitationId: result.invitationId,
      deliveryStatus: result.deliveryStatus,
      expiresAt: result.expiresAt,
    };
  }

  async accept(
    external: ExternalPrincipal,
    invitationId: string,
    rawToken: string,
    correlationId: string,
  ): Promise<InvitationAccepted> {
    const externalEmail = external.email?.trim().toLowerCase();
    if (!externalEmail) {
      throw new ForbiddenException("The identity provider must supply a verified email address");
    }

    return this.database.withControlPlaneTransaction(async (client) => {
      const invitationResult = await client.query<InvitationRow>(
        `SELECT id, tenant_id, email, role_key, scope_type, scope_id, status,
                token_digest, expires_at, invited_by
         FROM membership_invitations
         WHERE id = $1
         FOR UPDATE`,
        [invitationId],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) throw new NotFoundException("Invitation was not found");
      if (invitation.status === "accepted") {
        throw new ConflictException("Invitation has already been accepted");
      }
      if (!["pending-delivery", "sent"].includes(invitation.status)) {
        throw new GoneException("Invitation is no longer active");
      }
      if (invitation.expires_at.getTime() <= Date.now()) {
        throw new GoneException("Invitation has expired");
      }
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
         DO UPDATE SET email = EXCLUDED.email,
                       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
                       updated_at = now()
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

      const activeRole = await client.query(
        `SELECT 1 FROM role_assignments
         WHERE tenant_id = $1
           AND membership_id = $2
           AND role_key = $3
           AND scope_type = $4
           AND scope_id = $5
           AND valid_from <= now()
           AND (valid_until IS NULL OR valid_until > now())`,
        [
          invitation.tenant_id,
          membershipId,
          invitation.role_key,
          invitation.scope_type,
          invitation.scope_id,
        ],
      );
      if (activeRole.rowCount === 0) {
        await client.query(
          `INSERT INTO role_assignments (
             tenant_id, membership_id, role_key, scope_type, scope_id, assigned_by
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            invitation.tenant_id,
            membershipId,
            invitation.role_key,
            invitation.scope_type,
            invitation.scope_id,
            invitation.invited_by,
          ],
        );
      }
      await client.query(
        `UPDATE membership_invitations
         SET status = 'accepted', accepted_by_user_id = $2,
             token_digest = NULL, updated_at = now()
         WHERE id = $1`,
        [invitation.id, userId],
      );

      await this.identityAcceptance.complete(
        client,
        invitation.id,
        userId,
        membershipId,
        correlationId,
      );

      const tenantId = invitation.tenant_id as TenantId;
      const evidence = {
        status: "active",
        roleKey: invitation.role_key,
        scopeType: invitation.scope_type,
        scopeId: invitation.scope_id,
      };
      await this.audit.append(client, {
        tenantId,
        plane: "control",
        eventType: "membership.invitation.accepted",
        actorId: userId,
        membershipId,
        resourceType: "membership",
        resourceId: membershipId,
        correlationId,
        afterState: evidence,
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
        payload: { membershipId, userId, ...evidence },
      });

      return { tenantId, membershipId, status: "active" };
    });
  }
}
