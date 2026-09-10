import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { DeliveryTimetableQueryService } from "../application/delivery-timetable-query.service.js";

@Controller("institutions/:institutionId/delivery/timetable")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class DeliveryTimetableQueryController {
  constructor(
    private readonly timetableQuery: DeliveryTimetableQueryService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  timetable(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.catalogueRead,
      this.authorization.buildInstitutionResource(institutionId),
    );
    return this.timetableQuery.timetable(institutionId, from, to);
  }
}
