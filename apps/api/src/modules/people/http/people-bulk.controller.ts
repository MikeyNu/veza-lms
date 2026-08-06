import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { RequiresTenantPermission } from "../../../platform/authorization/requires-tenant-permission.decorator.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { BulkPersonStatusDto } from "../application/people-bulk.dto.js";
import { PeopleBulkService } from "../application/people-bulk.service.js";

@Controller("people")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class PeopleBulkController {
  constructor(private readonly bulk: PeopleBulkService) {}

  @Post("bulk-status")
  @RequiresTenantPermission(permissions.peopleUpdate)
  @UseGuards(MfaGuard)
  changeStatus(@Body() input: BulkPersonStatusDto) {
    return this.bulk.changeStatus(input);
  }
}
