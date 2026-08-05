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
import { permissions, type Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  ChangeOfferingStatusDto,
  CreateOfferingDto,
  CreateTimetableSlotDto,
  PromoteWaitlistEntryDto,
  ReinstateEnrolmentDto,
  UpsertRunOverlayDto,
} from "../application/delivery-completion.dto.js";
import { DeliveryCompletionService } from "../application/delivery-completion.service.js";

@Controller("institutions/:institutionId/delivery")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class DeliveryCompletionController {
  constructor(
    private readonly delivery: DeliveryCompletionService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  workspace(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.assert(request, permissions.catalogueRead, institutionId);
    return this.delivery.workspace(institutionId);
  }

  @Post("offerings")
  createOffering(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateOfferingDto,
  ) {
    this.assert(request, permissions.courseRunManage, institutionId);
    return this.delivery.createOffering(institutionId, input);
  }

  @Post("offerings/:offeringId/status")
  @UseGuards(MfaGuard)
  changeOfferingStatus(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("offeringId", new ParseUUIDPipe()) offeringId: string,
    @Body() input: ChangeOfferingStatusDto,
  ) {
    this.assert(request, permissions.courseRunManage, institutionId);
    return this.delivery.changeOfferingStatus(institutionId, offeringId, input);
  }

  @Put("runs/:runId/overlay")
  upsertRunOverlay(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() input: UpsertRunOverlayDto,
  ) {
    this.assert(request, permissions.courseRunManage, institutionId);
    return this.delivery.upsertOverlay(institutionId, runId, input);
  }

  @Post("timetable-slots")
  createTimetableSlot(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateTimetableSlotDto,
  ) {
    this.assert(request, permissions.classManage, institutionId);
    return this.delivery.createTimetableSlot(institutionId, input);
  }

  @Post("waitlist/:entryId/promote")
  @UseGuards(MfaGuard)
  promoteWaitlist(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("entryId", new ParseUUIDPipe()) entryId: string,
    @Body() input: PromoteWaitlistEntryDto,
  ) {
    this.assert(request, permissions.enrolmentManage, institutionId);
    return this.delivery.promoteWaitlist(institutionId, entryId, input);
  }

  @Post("enrolments/:enrolmentId/reinstate")
  @UseGuards(MfaGuard)
  reinstateEnrolment(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: ReinstateEnrolmentDto,
  ) {
    this.assert(request, permissions.enrolmentTransfer, institutionId);
    return this.delivery.reinstateEnrolment(institutionId, enrolmentId, input);
  }

  @Get("enrolments/:enrolmentId/history")
  enrolmentHistory(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
  ) {
    this.assert(request, permissions.enrolmentRead, institutionId);
    return this.delivery.enrolmentHistory(institutionId, enrolmentId);
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
