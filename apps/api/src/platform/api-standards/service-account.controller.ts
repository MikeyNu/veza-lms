import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { FastifyRequest } from "fastify";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { MfaGuard } from "../authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import {
  ClientCredentialsTokenDto,
  CreateServiceAccountDto,
  RotateServiceAccountSecretDto,
  UpdateServiceAccountStatusDto,
} from "./service-account.dto.js";
import { ServiceAccountService } from "./service-account.service.js";

@Controller("oauth")
export class OAuthTokenController {
  constructor(private readonly serviceAccounts: ServiceAccountService) {}

  @Post("token")
  token(
    @Req() request: FastifyRequest,
    @Headers("authorization") authorization: string | undefined,
    @Body() input: ClientCredentialsTokenDto,
  ) {
    return this.serviceAccounts.issueToken(input, authorization, request.ip);
  }
}

@Controller("service-accounts")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class ServiceAccountController {
  constructor(
    private readonly serviceAccounts: ServiceAccountService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    this.read(request);
    return this.serviceAccounts.list();
  }

  @Post()
  @UseGuards(MfaGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateServiceAccountDto,
  ) {
    this.manage(request);
    return this.serviceAccounts.create(input);
  }

  @Post(":accountId/rotate-secret")
  @UseGuards(MfaGuard)
  rotateSecret(
    @Req() request: AuthenticatedRequest,
    @Param("accountId", new ParseUUIDPipe()) accountId: string,
    @Body() input: RotateServiceAccountSecretDto,
  ) {
    this.manage(request);
    return this.serviceAccounts.rotateSecret(accountId, input);
  }

  @Post(":accountId/status")
  @UseGuards(MfaGuard)
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param("accountId", new ParseUUIDPipe()) accountId: string,
    @Body() input: UpdateServiceAccountStatusDto,
  ) {
    this.manage(request);
    return this.serviceAccounts.updateStatus(accountId, input);
  }

  private read(request: AuthenticatedRequest): void {
    this.authorization.assertPermission(
      request,
      permissions.tenantRead,
      this.authorization.buildTenantResource(),
    );
  }

  private manage(request: AuthenticatedRequest): void {
    this.authorization.assertPermission(
      request,
      permissions.tenantConfigure,
      this.authorization.buildTenantResource(),
    );
  }
}
