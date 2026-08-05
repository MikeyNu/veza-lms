import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import { IsString, Matches, MaxLength } from "class-validator";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { MfaGuard } from "../authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import { CacheService } from "./cache.service.js";

class InvalidateCacheNamespaceDto {
  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:-]{1,160}$/)
  namespace!: string;
}

@Controller("cache")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class CacheController {
  constructor(
    private readonly cache: CacheService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get("health")
  health(@Req() request: AuthenticatedRequest) {
    this.authorization.assertPermission(
      request,
      permissions.tenantRead,
      this.authorization.buildTenantResource(),
    );
    return this.cache.health();
  }

  @Post("invalidate")
  @UseGuards(MfaGuard)
  async invalidate(
    @Req() request: AuthenticatedRequest,
    @Body() input: InvalidateCacheNamespaceDto,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.tenantConfigure,
      this.authorization.buildTenantResource(),
    );
    const epoch = await this.cache.invalidateNamespace(input.namespace);
    return { namespace: input.namespace, epoch, invalidatedAt: new Date().toISOString() };
  }
}
