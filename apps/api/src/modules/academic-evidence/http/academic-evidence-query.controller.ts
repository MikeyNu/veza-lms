import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { AcademicEvidenceQueryService } from "../application/academic-evidence-query.service.js";

@Controller()
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class AcademicEvidenceQueryController {
  constructor(
    private readonly query: AcademicEvidenceQueryService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get("institutions/:institutionId/academic-evidence")
  workspace(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.gradebookRead,
      this.authorization.buildInstitutionResource(institutionId),
    );
    return this.query.workspace(institutionId);
  }

  @Get("learner/assignments")
  learnerAssignments(@Req() request: AuthenticatedRequest) {
    this.authorization.assertPermission(
      request,
      permissions.assignmentRead,
      this.authorization.buildTenantResource(),
    );
    return this.query.learnerAssignments();
  }

  @Get("learner/gradebook/:courseRunId")
  learnerGradebook(
    @Req() request: AuthenticatedRequest,
    @Param("courseRunId", new ParseUUIDPipe()) courseRunId: string,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.gradebookRead,
      this.authorization.buildTenantResource(),
    );
    return this.query.learnerGradebook(courseRunId);
  }

  @Get("academic-evidence/gradebook/:courseRunId/staff")
  staffGradebook(
    @Req() request: AuthenticatedRequest,
    @Param("courseRunId", new ParseUUIDPipe()) courseRunId: string,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.gradebookRead,
      this.authorization.buildTenantResource(),
    );
    return this.query.staffGradebook(courseRunId);
  }
}
