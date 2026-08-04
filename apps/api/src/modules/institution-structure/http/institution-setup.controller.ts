import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { permissions, type Permission, type ResourceScope } from "@veza/authz";
import type { AcademicPeriodId, InstitutionId } from "@veza/contracts";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { RequiresTenantPermission } from "../../../platform/authorization/requires-tenant-permission.decorator.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  ApproveInstitutionalPolicyDto,
  ConfigureTenantSetupProfileDto,
  CreateAcademicPeriodDto,
  CreateCampusDto,
  CreateInstitutionDto,
  CreateOrganisationalUnitDto,
} from "../application/institution-setup.dto.js";
import { InstitutionQueryService } from "../application/institution-query.service.js";
import { InstitutionStructureService } from "../application/institution-structure.service.js";
import { TenantActivationService } from "../application/tenant-activation.service.js";

@Controller("institution-setup")
@UseGuards(AuthenticationGuard, TenantMembershipGuard)
export class InstitutionSetupController {
  constructor(
    private readonly structure: InstitutionStructureService,
    private readonly activation: TenantActivationService,
    private readonly query: InstitutionQueryService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  @RequiresTenantPermission(permissions.tenantRead)
  @UseGuards(TenantPermissionGuard)
  overview() {
    return this.structure.overview();
  }

  @Put("profile")
  @RequiresTenantPermission(permissions.tenantConfigure)
  @UseGuards(TenantPermissionGuard, MfaGuard)
  configureProfile(@Body() input: ConfigureTenantSetupProfileDto) {
    return this.structure.configureProfile(input);
  }

  @Post("institutions")
  @RequiresTenantPermission(permissions.institutionCreate)
  @UseGuards(TenantPermissionGuard)
  createInstitution(@Body() input: CreateInstitutionDto) {
    return this.structure.createInstitution(input);
  }

  @Get("institutions/:institutionId")
  institutionOverview(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: InstitutionId,
  ) {
    this.assertInstitutionPermission(request, permissions.institutionConfigure, institutionId);
    return this.query.institutionOverview(institutionId);
  }

  @Post("institutions/:institutionId/campuses")
  createCampus(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: InstitutionId,
    @Body() input: CreateCampusDto,
  ) {
    this.assertInstitutionPermission(request, permissions.campusManage, institutionId);
    return this.structure.createCampus(institutionId, input);
  }

  @Post("institutions/:institutionId/organisational-units")
  createOrganisationalUnit(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: InstitutionId,
    @Body() input: CreateOrganisationalUnitDto,
  ) {
    this.assertInstitutionPermission(request, permissions.organisationalUnitManage, institutionId);
    return this.structure.createOrganisationalUnit(institutionId, input);
  }

  @Post("institutions/:institutionId/academic-periods")
  createAcademicPeriod(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: InstitutionId,
    @Body() input: CreateAcademicPeriodDto,
  ) {
    this.assertInstitutionPermission(request, permissions.academicPeriodManage, institutionId);
    return this.structure.createAcademicPeriod(institutionId, input);
  }

  @Post("institutions/:institutionId/academic-periods/:periodId/publish")
  @UseGuards(MfaGuard)
  publishAcademicPeriod(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: InstitutionId,
    @Param("periodId", new ParseUUIDPipe()) periodId: AcademicPeriodId,
  ) {
    this.assertInstitutionPermission(request, permissions.academicPeriodManage, institutionId);
    return this.structure.publishAcademicPeriod(institutionId, periodId);
  }

  @Post("institutions/:institutionId/policies/approve")
  @UseGuards(MfaGuard)
  approvePolicy(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: InstitutionId,
    @Body() input: ApproveInstitutionalPolicyDto,
  ) {
    this.assertInstitutionPermission(request, permissions.institutionalPolicyApprove, institutionId);
    return this.structure.approvePolicy(institutionId, input);
  }

  @Get("activation-readiness")
  @RequiresTenantPermission(permissions.tenantRead)
  @UseGuards(TenantPermissionGuard)
  readiness() {
    return this.activation.readiness();
  }

  @Post("activate")
  @RequiresTenantPermission(permissions.tenantActivate)
  @UseGuards(TenantPermissionGuard, MfaGuard)
  activate() {
    return this.activation.activate();
  }

  private assertInstitutionPermission(
    request: AuthenticatedRequest,
    permission: Permission,
    institutionId: InstitutionId,
  ): void {
    const tenantId = request.workspaceSession?.tenant.id;
    if (!tenantId) throw new Error("Workspace session is required for institution permission evaluation");
    const resource: ResourceScope = {
      type: "institution",
      id: institutionId,
      ancestors: [{ type: "tenant", id: tenantId }],
    };
    this.authorization.assertPermission(request, permission, resource);
  }
}
