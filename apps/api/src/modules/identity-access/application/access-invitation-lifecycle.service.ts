import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { permissions, type ResourceScope } from "@veza/authz";
import type { BaselineRoleKey } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import { InvitationTokenService } from "../security/invitation-token.service.js";
import type {
  BulkRevokeAccessInvitationsDto,
  ResendAccessInvitationDto,
} from "./access-invitation-lifecycle.dto.js";

interface ActiveInvitationRow extends QueryResultRow {
  readonly id: string;
  readonly email: string;
  readonly role_key: BaselineRoleKey;
  readonly scope_type: "tenant" | "institution";
  readonly scope_id: string;
  readonly status: string;
  readonly expires_at: Date;
}

function reason(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

@Injectable()
export class AccessInvitationLifecycleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly authorization: TenantAuthorizationService,
    private readonly tokens: InvitationTokenService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async resend(
    request: AuthenticatedRequest,
    invitationId: string,
    input: ResendAccessInvitationDto,
  ) {
    const context = this.context.require();
    const operationId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<ActiveInvitationRow>(
        `SELECT id,email::text,role_key,scope_type,scope_id,status,expires_at
         FROM membership_invitations
         WHERE tenant_id=$1 AND id=$2
         FOR UPDATE`,
        [context.tenantId, invitationId],
      );
      const invitation = result.rows[0];
      if (!invitation) throw new NotFoundException("Invitation was not found");
      if (!["pending-delivery", "sent"].includes(invitation.status)) {
        throw new ConflictException("Invitation is no longer active");
      }
      this.assertInvitationAuthority(request, invitation);
      const secret = this.tokens.create();
      const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
      const normalizedReason = reason(input.reason);
      await client.query(
        `UPDATE membership_invitations
         SET status='pending-delivery',token_digest=$3,expires_at=$4,updated_at=now()
         WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId, invitation.id, secret.tokenDigest, expiresAt],
      );
      const evidence = {
        operationId,
        email: invitation.email,
        roleKey: invitation.role_key,
        scopeType: invitation.scope_type,
        scopeId: invitation.scope_id,
        previousExpiry: invitation.expires_at.toISOString(),
        expiresAt: expiresAt.toISOString(),
        reason: normalizedReason,
      };
      await this.audit.append(client, {
        tenantId: context.tenantId,
        plane: "application",
        eventType: "membership.invitation.resent",
        actorId: context.actorId,
        membershipId: context.membershipId,
        resourceType: "membership-invitation",
        resourceId: invitation.id,
        purpose: normalizedReason,
        correlationId: context.correlationId,
        afterState: evidence,
      });
      await this.outbox.append(client, {
        tenantId: context.tenantId,
        eventName: "identity.membership-invitation.requested",
        eventVersion: 1,
        aggregateType: "membership-invitation",
        aggregateId: invitation.id,
        aggregateVersion: 2,
        actorId: context.actorId,
        correlationId: context.correlationId,
        payload: { ...evidence, invitationId: invitation.id, encryptedToken: secret.encryptedToken },
      });
      return {
        invitationId: invitation.id,
        operationId,
        status: "pending-delivery" as const,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async bulkRevoke(
    request: AuthenticatedRequest,
    input: BulkRevokeAccessInvitationsDto,
  ) {
    const context = this.context.require();
    const operationId = randomUUID();
    const normalizedReason = reason(input.reason);
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<ActiveInvitationRow>(
        `SELECT id,email::text,role_key,scope_type,scope_id,status,expires_at
         FROM membership_invitations
         WHERE tenant_id=$1 AND id=ANY($2::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [context.tenantId, input.invitationIds],
      );
      if (result.rows.length !== input.invitationIds.length) {
        throw new NotFoundException("One or more selected invitations were not found");
      }
      for (const invitation of result.rows) {
        if (!["pending-delivery", "sent"].includes(invitation.status)) {
          throw new ConflictException("One or more selected invitations are no longer active");
        }
        this.assertInvitationAuthority(request, invitation);
      }

      for (const invitation of result.rows) {
        await client.query(
          `UPDATE membership_invitations
           SET status='revoked',token_digest=NULL,updated_at=now()
           WHERE tenant_id=$1 AND id=$2`,
          [context.tenantId, invitation.id],
        );
        const evidence = {
          operationId,
          email: invitation.email,
          roleKey: invitation.role_key,
          scopeType: invitation.scope_type,
          scopeId: invitation.scope_id,
          reason: normalizedReason,
        };
        await this.audit.append(client, {
          tenantId: context.tenantId,
          plane: "application",
          eventType: "membership.invitation.revoked",
          actorId: context.actorId,
          membershipId: context.membershipId,
          resourceType: "membership-invitation",
          resourceId: invitation.id,
          purpose: normalizedReason,
          correlationId: context.correlationId,
          afterState: evidence,
          metadata: { operationId, mode: "bulk" },
        });
        await this.outbox.append(client, {
          tenantId: context.tenantId,
          eventName: "identity.membership-invitation.revoked",
          eventVersion: 1,
          aggregateType: "membership-invitation",
          aggregateId: invitation.id,
          aggregateVersion: 2,
          actorId: context.actorId,
          correlationId: context.correlationId,
          payload: { invitationId: invitation.id, ...evidence },
        });
      }
      return {
        operationId,
        status: "revoked" as const,
        revokedCount: result.rows.length,
        invitationIds: result.rows.map((invitation) => invitation.id),
      };
    });
  }

  private assertInvitationAuthority(
    request: AuthenticatedRequest,
    invitation: Pick<ActiveInvitationRow, "role_key" | "scope_type" | "scope_id">,
  ): void {
    const resource = this.resource(invitation.scope_type, invitation.scope_id);
    this.authorization.assertPermission(request, permissions.membershipInvite, resource);
    this.authorization.assertCanDelegate(request, invitation.role_key, resource);
  }

  private resource(scopeType: "tenant" | "institution", scopeId: string): ResourceScope {
    const context = this.context.require();
    if (scopeType === "tenant") {
      if (scopeId !== context.tenantId) throw new BadRequestException("Tenant invitation scope does not match the active workspace");
      return this.authorization.buildTenantResource();
    }
    return this.authorization.buildInstitutionResource(scopeId);
  }
}
