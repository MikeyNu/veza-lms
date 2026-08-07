import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import { CommunicationsRecipientService } from "./communications-recipient.service.js";

@Controller("communications")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class CommunicationsRecipientController {
  constructor(
    private readonly communications: CommunicationsRecipientService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get("recipient-workspace")
  workspace(@Req() request: AuthenticatedRequest) {
    this.authorization.assertPermission(
      request,
      permissions.tenantRead,
      this.authorization.buildTenantResource(),
    );
    return this.communications.workspace();
  }
}
