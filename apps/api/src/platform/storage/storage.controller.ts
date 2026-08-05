import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
import { StorageAccessibilityService } from "./storage-accessibility.service.js";
import { StorageAdministrationService } from "./storage-administration.service.js";
import {
  ApproveMediaDeletionDto,
  CompleteMediaUploadDto,
  CreateMediaUploadDto,
  CreateRecordingConsentDto,
  CreateStorageNamespaceDto,
  CreateStoragePolicyDto,
  RecordMediaAccessibilityDto,
  RequestMediaDeletionDto,
  UpdateStorageQuotaDto,
  WithdrawRecordingConsentDto,
} from "./storage.dto.js";
import { StorageService } from "./storage.service.js";

@Controller("storage")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly accessibility: StorageAccessibilityService,
    private readonly administration: StorageAdministrationService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get("workspace")
  workspace(@Req() request: AuthenticatedRequest) {
    this.read(request);
    return this.storage.workspace();
  }

  @Get("deletion-requests")
  deletionRequests(@Req() request: AuthenticatedRequest) {
    this.read(request);
    return this.administration.deletionRequests();
  }

  @Put("quota")
  updateQuota(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateStorageQuotaDto,
  ) {
    this.manage(request);
    return this.administration.updateQuota(input);
  }

  @Post("namespaces")
  createNamespace(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateStorageNamespaceDto,
  ) {
    this.manage(request);
    return this.storage.createNamespace(input);
  }

  @Post("policies")
  createPolicy(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateStoragePolicyDto,
  ) {
    this.manage(request);
    return this.storage.createPolicy(input);
  }

  @Post("uploads")
  createUpload(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateMediaUploadDto,
  ) {
    this.manage(request);
    return this.storage.createUpload(input);
  }

  @Post("upload-sessions/:sessionId/complete")
  completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
    @Body() input: CompleteMediaUploadDto,
  ) {
    this.manage(request);
    return this.storage.completeUpload(sessionId, input);
  }

  @Post("assets/:assetId/accessibility")
  recordAccessibility(
    @Req() request: AuthenticatedRequest,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: RecordMediaAccessibilityDto,
  ) {
    this.manage(request);
    return this.accessibility.record(assetId, input);
  }

  @Get("assets/:assetId/delivery")
  delivery(
    @Req() request: AuthenticatedRequest,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Query("rendition") renditionKey?: string,
  ) {
    this.read(request);
    return this.storage.deliveryUrl(assetId, renditionKey);
  }

  @Post("recording-consents")
  createConsent(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateRecordingConsentDto,
  ) {
    this.manage(request);
    return this.storage.createConsent(input);
  }

  @Post("recording-consents/:consentId/withdraw")
  withdrawConsent(
    @Req() request: AuthenticatedRequest,
    @Param("consentId", new ParseUUIDPipe()) consentId: string,
    @Body() input: WithdrawRecordingConsentDto,
  ) {
    this.manage(request);
    return this.storage.withdrawConsent(consentId, input);
  }

  @Post("assets/:assetId/deletions")
  requestDeletion(
    @Req() request: AuthenticatedRequest,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: RequestMediaDeletionDto,
  ) {
    this.manage(request);
    return this.storage.requestDeletion(assetId, input);
  }

  @Post("deletions/:requestId/approve")
  @UseGuards(MfaGuard)
  approveDeletion(
    @Req() request: AuthenticatedRequest,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
    @Body() input: ApproveMediaDeletionDto,
  ) {
    this.manage(request);
    return this.storage.approveDeletion(requestId, input);
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
