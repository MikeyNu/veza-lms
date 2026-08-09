import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { TenantPermissionGuard } from "../authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import { SearchQueryDto } from "./search.dto.js";
import { SearchService } from "./search.service.js";

@Controller("search")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Req() request: AuthenticatedRequest, @Query() input: SearchQueryDto) {
    const membership = request.workspaceSession?.membership;
    if (!membership) throw new Error("Tenant membership was not resolved");
    return this.searchService.search(input, membership);
  }
}
