import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { permissions, type Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  ApproveTerminologyDto,
  CreateTerminologyVersionDto,
  SubmitTerminologyReviewDto,
} from "../application/terminology.dto.js";
import { TerminologyService } from "../application/terminology.service.js";

@Controller("institutions/:institutionId/terminology")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class TerminologyController {
  constructor(
    private readonly terminology: TerminologyService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.assert(request, permissions.terminologyRead, institutionId);
    return this.terminology.list(institutionId);
  }

  @Get("resolved")
  resolve(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Query("locale") locale = "en-ZA",
    @Query("effectiveAt") effectiveAt?: string,
  ) {
    this.assert(request, permissions.terminologyRead, institutionId);
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) {
      throw new BadRequestException("Terminology locale is invalid");
    }
    return this.terminology.resolve(institutionId, locale, effectiveAt);
  }

  @Get(":versionId")
  get(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
  ) {
    this.assert(request, permissions.terminologyRead, institutionId);
    return this.terminology.get(institutionId, versionId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateTerminologyVersionDto,
  ) {
    this.assert(request, permissions.terminologyManage, institutionId);
    return this.terminology.create(institutionId, input);
  }

  @Post(":versionId/submit")
  submit(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: SubmitTerminologyReviewDto,
  ) {
    this.assert(request, permissions.terminologyManage, institutionId);
    return this.terminology.submit(institutionId, versionId, input);
  }

  @Post(":versionId/approve")
  @UseGuards(MfaGuard)
  approve(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: ApproveTerminologyDto,
  ) {
    this.assert(request, permissions.terminologyApprove, institutionId);
    return this.terminology.approve(institutionId, versionId, input);
  }

  private assert(
    request: AuthenticatedRequest,
    permission: Permission,
    institutionId: string,
  ): void {
    this.authorization.assertPermission(
      request,
      permission,
      this.authorization.buildInstitutionResource(institutionId),
    );
  }
}
