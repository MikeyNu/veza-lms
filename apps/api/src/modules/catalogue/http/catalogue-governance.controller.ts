import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { permissions, type Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  AddCourseRequisiteDto,
  AllocateClassStaffDto,
  ChangeEnrolmentStatusDto,
  ChangeRunLifecycleDto,
  LinkProgrammeCourseDto,
} from "../application/catalogue-governance.dto.js";
import { CatalogueGovernanceService } from "../application/catalogue-governance.service.js";

@Controller("institutions/:institutionId/catalogue")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class CatalogueGovernanceController {
  constructor(
    private readonly governance: CatalogueGovernanceService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Post("programmes/versions/:versionId/courses")
  linkProgrammeCourse(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: LinkProgrammeCourseDto,
  ) {
    this.assert(request, permissions.programmeManage, institutionId);
    return this.governance.linkProgrammeCourse(institutionId, versionId, input);
  }

  @Post("blueprints/versions/:versionId/requisites")
  addRequisite(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: AddCourseRequisiteDto,
  ) {
    this.assert(request, permissions.blueprintManage, institutionId);
    return this.governance.addRequisite(institutionId, versionId, input);
  }

  @Post("runs/:runId/lifecycle")
  @UseGuards(MfaGuard)
  changeRunLifecycle(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() input: ChangeRunLifecycleDto,
  ) {
    this.assert(request, permissions.courseRunManage, institutionId);
    return this.governance.changeRunLifecycle(institutionId, runId, input);
  }

  @Post("enrolments/:enrolmentId/status")
  changeEnrolmentStatus(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: ChangeEnrolmentStatusDto,
  ) {
    this.assert(request, permissions.enrolmentManage, institutionId);
    return this.governance.changeEnrolmentStatus(institutionId, enrolmentId, input);
  }

  @Post("classes/:classSectionId/staff")
  allocateClassStaff(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("classSectionId", new ParseUUIDPipe()) classSectionId: string,
    @Body() input: AllocateClassStaffDto,
  ) {
    this.assert(request, permissions.classManage, institutionId);
    return this.governance.allocateClassStaff(institutionId, classSectionId, input);
  }

  private assert(request: AuthenticatedRequest, permission: Permission, institutionId: string): void {
    this.authorization.assertPermission(
      request,
      permission,
      this.authorization.buildInstitutionResource(institutionId),
    );
  }
}
