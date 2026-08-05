import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { permissions, type Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  ApproveCurriculumDto,
  CreateBlueprintDto,
  CreateClassDto,
  CreateCohortDto,
  CreateEnrolmentDto,
  CreateOutcomeDto,
  CreateProgrammeDto,
  CreateRunDto,
  TransferEnrolmentDto,
} from "../application/catalogue.dto.js";
import { CatalogueService } from "../application/catalogue.service.js";

@Controller("institutions/:institutionId/catalogue")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class CatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  workspace(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.assert(request, permissions.catalogueRead, institutionId);
    return this.catalogue.workspace(institutionId);
  }

  @Post("outcomes")
  createOutcome(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateOutcomeDto,
  ) {
    this.assert(request, permissions.outcomeManage, institutionId);
    return this.catalogue.createOutcome(institutionId, input);
  }

  @Post("programmes")
  createProgramme(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateProgrammeDto,
  ) {
    this.assert(request, permissions.programmeManage, institutionId);
    return this.catalogue.createProgramme(institutionId, input);
  }

  @Post("programmes/versions/:versionId/approve")
  @UseGuards(MfaGuard)
  approveProgramme(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: ApproveCurriculumDto,
  ) {
    this.assert(request, permissions.programmeApprove, institutionId);
    return this.catalogue.approveProgramme(institutionId, versionId, input);
  }

  @Post("blueprints")
  createBlueprint(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateBlueprintDto,
  ) {
    this.assert(request, permissions.blueprintManage, institutionId);
    return this.catalogue.createBlueprint(institutionId, input);
  }

  @Post("blueprints/versions/:versionId/approve")
  @UseGuards(MfaGuard)
  approveBlueprint(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: ApproveCurriculumDto,
  ) {
    this.assert(request, permissions.blueprintApprove, institutionId);
    return this.catalogue.approveBlueprint(institutionId, versionId, input);
  }

  @Post("runs")
  createRun(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateRunDto,
  ) {
    this.assert(request, permissions.courseRunManage, institutionId);
    return this.catalogue.createRun(institutionId, input);
  }

  @Post("cohorts")
  createCohort(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateCohortDto,
  ) {
    this.assert(request, permissions.cohortManage, institutionId);
    return this.catalogue.createCohort(institutionId, input);
  }

  @Post("classes")
  createClass(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateClassDto,
  ) {
    this.assert(request, permissions.classManage, institutionId);
    return this.catalogue.createClass(institutionId, input);
  }

  @Post("enrolments")
  enrol(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateEnrolmentDto,
  ) {
    this.assert(request, permissions.enrolmentManage, institutionId);
    return this.catalogue.enrol(institutionId, input);
  }

  @Post("enrolments/:enrolmentId/transfer")
  @UseGuards(MfaGuard)
  transfer(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: TransferEnrolmentDto,
  ) {
    this.assert(request, permissions.enrolmentTransfer, institutionId);
    return this.catalogue.transfer(institutionId, enrolmentId, input);
  }

  private assert(request: AuthenticatedRequest, permission: Permission, institutionId: string): void {
    this.authorization.assertPermission(
      request,
      permission,
      this.authorization.buildInstitutionResource(institutionId),
    );
  }
}
