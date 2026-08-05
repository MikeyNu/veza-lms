import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import { SearchQueryDto } from "./search.dto.js";
import { SearchService } from "./search.service.js";

@Controller("search")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  search(@Req() request: AuthenticatedRequest, @Query() input: SearchQueryDto) {
    this.authorization.assertPermission(
      request,
      permissions.tenantRead,
      this.authorization.buildTenantResource(),
    );
    if (!request.membership) throw new Error("Tenant membership was not resolved");
    return this.searchService.search(input, request.membership);
  }
}
