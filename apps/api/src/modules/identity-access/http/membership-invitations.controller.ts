import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { ExternalAuthenticationGuard } from "../../../platform/authentication/external-authentication.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { AcceptInvitationDto } from "../application/accept-invitation.dto.js";
import { InviteTenantOwnerDto } from "../application/invite-tenant-owner.dto.js";
import { MembershipInvitationService } from "../application/membership-invitation.service.js";
import { RequiresTenantPermission } from "../../../platform/authorization/requires-tenant-permission.decorator.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";

@Controller("membership-invitations")
export class MembershipInvitationsController {
  constructor(private readonly invitations: MembershipInvitationService) {}

  @Post("tenant-owners")
  @RequiresTenantPermission(permissions.membershipInvite)
  @UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
  inviteTenantOwner(@Req() request: AuthenticatedRequest, @Body() input: InviteTenantOwnerDto) {
    return this.invitations.inviteTenantOwner(request, input.email, input.expiresInDays);
  }

  @Post("accept")
  @UseGuards(ExternalAuthenticationGuard)
  accept(@Req() request: AuthenticatedRequest, @Body() input: AcceptInvitationDto) {
    if (!request.externalPrincipal) throw new Error("External principal was not resolved");
    return this.invitations.accept(
      request.externalPrincipal,
      input.invitationId,
      input.token,
      request.correlationId ?? "missing-correlation-id",
    );
  }
}
