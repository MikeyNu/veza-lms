import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { MfaGuard } from "../authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import {
  ApproveNotificationTemplateDto,
  ConfigureTenantSenderDto,
  CreateNotificationTemplateDto,
  CreateNotificationTemplateVersionDto,
  QueueNotificationDto,
  UpdateNotificationPreferenceDto,
  VerifyTenantSenderDto,
  VersionedDecisionDto,
} from "./communications.dto.js";
import { CommunicationsService } from "./communications.service.js";

@Controller("communications")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class CommunicationsController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get("workspace")
  workspace(@Req() request: AuthenticatedRequest) {
    this.authorization.assertPermission(
      request,
      permissions.tenantConfigure,
      this.authorization.buildTenantResource(),
    );
    return this.communications.workspace();
  }

  @Post("templates")
  createTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateNotificationTemplateDto,
  ) {
    this.manage(request);
    return this.communications.createTemplate(input);
  }

  @Post("templates/:templateId/versions")
  createVersion(
    @Req() request: AuthenticatedRequest,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Body() input: CreateNotificationTemplateVersionDto,
  ) {
    this.manage(request);
    return this.communications.createTemplateVersion(templateId, input);
  }

  @Post("template-versions/:versionId/submit")
  submitVersion(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: VersionedDecisionDto,
  ) {
    this.manage(request);
    return this.communications.submitTemplateVersion(versionId, input);
  }

  @Post("template-versions/:versionId/approve")
  @UseGuards(MfaGuard)
  approveVersion(
    @Req() request: AuthenticatedRequest,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: ApproveNotificationTemplateDto,
  ) {
    this.manage(request);
    return this.communications.approveTemplateVersion(versionId, input);
  }

  @Post("senders")
  configureSender(
    @Req() request: AuthenticatedRequest,
    @Body() input: ConfigureTenantSenderDto,
  ) {
    this.manage(request);
    return this.communications.configureSender(input);
  }

  @Post("senders/:senderId/verify")
  @UseGuards(MfaGuard)
  verifySender(
    @Req() request: AuthenticatedRequest,
    @Param("senderId", new ParseUUIDPipe()) senderId: string,
    @Body() input: VerifyTenantSenderDto,
  ) {
    this.manage(request);
    return this.communications.verifySender(senderId, input);
  }

  @Post("preferences")
  updatePreference(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateNotificationPreferenceDto,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.tenantRead,
      this.authorization.buildTenantResource(),
    );
    return this.communications.updatePreference(input);
  }

  @Post("intents")
  queue(
    @Req() request: AuthenticatedRequest,
    @Body() input: QueueNotificationDto,
  ) {
    this.manage(request);
    return this.communications.queue(input);
  }

  private manage(request: AuthenticatedRequest): void {
    this.authorization.assertPermission(
      request,
      permissions.tenantConfigure,
      this.authorization.buildTenantResource(),
    );
  }
}
