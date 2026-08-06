import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  BulkRevokeAccessInvitationsDto,
  ResendAccessInvitationDto,
} from "../application/access-invitation-lifecycle.dto.js";
import { AccessInvitationLifecycleService } from "../application/access-invitation-lifecycle.service.js";

@Controller("access-directory/invitations")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, MfaGuard)
export class AccessInvitationLifecycleController {
  constructor(private readonly lifecycle: AccessInvitationLifecycleService) {}

  @Post("bulk-revoke")
  bulkRevoke(
    @Req() request: AuthenticatedRequest,
    @Body() input: BulkRevokeAccessInvitationsDto,
  ) {
    return this.lifecycle.bulkRevoke(request, input);
  }

  @Post(":invitationId/resend")
  resend(
    @Req() request: AuthenticatedRequest,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" })) invitationId: string,
    @Body() input: ResendAccessInvitationDto,
  ) {
    return this.lifecycle.resend(request, invitationId, input);
  }
}
