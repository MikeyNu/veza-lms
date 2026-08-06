import {
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
import { permissions } from "@veza/authz";
import type { MembershipId, RoleAssignmentId } from "@veza/contracts";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  AssignRoleDto,
  ChangeMembershipStatusDto,
  CreateAccessInvitationDto,
  EndRoleAssignmentDto,
  ListAccessDirectoryDto,
  RevokeInvitationDto,
} from "../application/access-administration.dto.js";
import { AccessAdministrationService } from "../application/access-administration.service.js";
import { AccessDirectoryQueryService } from "../application/access-directory-query.service.js";
import { AccessInvitationLifecycleService } from "../application/access-invitation-lifecycle.service.js";

@Controller("access-directory")
@UseGuards(AuthenticationGuard, TenantMembershipGuard)
export class AccessDirectoryController {
  constructor(
    private readonly query: AccessDirectoryQueryService,
    private readonly access: AccessAdministrationService,
    private readonly invitationLifecycle: AccessInvitationLifecycleService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() input: ListAccessDirectoryDto) {
    const resource = input.institutionId
      ? this.authorization.buildInstitutionResource(input.institutionId)
      : this.authorization.buildTenantResource();
    this.authorization.assertPermission(request, permissions.membershipRead, resource);
    return this.query.list(input);
  }

  @Post("invitations")
  @UseGuards(MfaGuard)
  invite(@Req() request: AuthenticatedRequest, @Body() input: CreateAccessInvitationDto) {
    return this.access.createInvitation(request, input);
  }

  @Post("memberships/:membershipId/role-assignments")
  @UseGuards(MfaGuard)
  assignRole(
    @Req() request: AuthenticatedRequest,
    @Param("membershipId", new ParseUUIDPipe({ version: "4" })) membershipId: MembershipId,
    @Body() input: AssignRoleDto,
  ) {
    return this.access.assignRole(request, membershipId, input);
  }

  @Post("role-assignments/:assignmentId/end")
  @UseGuards(MfaGuard)
  endRole(
    @Req() request: AuthenticatedRequest,
    @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: RoleAssignmentId,
    @Body() input: EndRoleAssignmentDto,
  ) {
    return this.access.endRole(request, assignmentId, input.reason);
  }

  @Post("memberships/:membershipId/status")
  @UseGuards(MfaGuard)
  changeMembershipStatus(
    @Req() request: AuthenticatedRequest,
    @Param("membershipId", new ParseUUIDPipe({ version: "4" })) membershipId: MembershipId,
    @Body() input: ChangeMembershipStatusDto,
  ) {
    return this.access.changeMembershipStatus(request, membershipId, input);
  }

  @Post("invitations/:invitationId/revoke")
  @UseGuards(MfaGuard)
  revokeInvitation(
    @Req() request: AuthenticatedRequest,
    @Param("invitationId", new ParseUUIDPipe({ version: "4" })) invitationId: string,
    @Body() input: RevokeInvitationDto,
  ) {
    return this.invitationLifecycle.bulkRevoke(request, {
      invitationIds: [invitationId],
      reason: input.reason,
    });
  }
}
