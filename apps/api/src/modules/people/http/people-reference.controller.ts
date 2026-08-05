import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { PeopleReferenceService } from "../application/people-reference.service.js";

@Controller("people/institutions/:institutionId/references")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class PeopleReferenceController {
  constructor(
    private readonly references: PeopleReferenceService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  load(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.peopleRead,
      this.authorization.buildInstitutionResource(institutionId),
    );
    return this.references.load(institutionId);
  }
}
