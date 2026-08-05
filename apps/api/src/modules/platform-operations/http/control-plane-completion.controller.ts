import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import {
  CancelTenantDeletionDto,
  ChangeTenantLifecycleDto,
  CompleteTenantExportDto,
  CreateRetentionHoldDto,
  CreateSupportCaseDto,
  RecordCustomerApprovalDto,
  RecordSecurityIncidentDto,
  ReleaseRetentionHoldDto,
  RequestTenantExportDto,
  ResolveSupportCaseDto,
  ScheduleTenantDeletionDto,
  SetBillingLinkDto,
  SetEntitlementOverrideDto,
  SetUsageThresholdDto,
  StartSupportElevationDto,
  TerminateSupportSessionDto,
  UpdateTenantOperationsDto,
} from "../application/control-plane-completion.dto.js";
import { ControlPlaneCompletionService } from "../application/control-plane-completion.service.js";

@Controller("control-plane/operations")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneCompletionController {
  constructor(private readonly operations: ControlPlaneCompletionService) {}

  @Get("overview")
  overview() {
    return this.operations.operationsOverview();
  }

  @Get("tenants/:tenantId")
  tenant(@Param("tenantId", new ParseUUIDPipe()) tenantId: string) {
    return this.operations.tenantDetail(tenantId);
  }

  @Put("tenants/:tenantId/profile")
  @UseGuards(MfaGuard)
  updateTenant(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: UpdateTenantOperationsDto,
  ) {
    return this.operations.updateTenantOperations(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/lifecycle")
  @UseGuards(MfaGuard)
  lifecycle(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ChangeTenantLifecycleDto,
  ) {
    return this.operations.changeTenantLifecycle(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/exports")
  @UseGuards(MfaGuard)
  requestExport(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: RequestTenantExportDto,
  ) {
    return this.operations.requestExport(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/exports/:receiptId/complete")
  @UseGuards(MfaGuard)
  completeExport(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("receiptId", new ParseUUIDPipe()) receiptId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CompleteTenantExportDto,
  ) {
    return this.operations.completeExport(
      this.principal(request), tenantId, receiptId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/retention-holds")
  @UseGuards(MfaGuard)
  createHold(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateRetentionHoldDto,
  ) {
    return this.operations.createRetentionHold(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/retention-holds/:holdId/release")
  @UseGuards(MfaGuard)
  releaseHold(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("holdId", new ParseUUIDPipe()) holdId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ReleaseRetentionHoldDto,
  ) {
    return this.operations.releaseRetentionHold(
      this.principal(request), tenantId, holdId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/deletion-schedules")
  @UseGuards(MfaGuard)
  scheduleDeletion(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ScheduleTenantDeletionDto,
  ) {
    return this.operations.scheduleDeletion(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/deletion-schedules/:scheduleId/cancel")
  @UseGuards(MfaGuard)
  cancelDeletion(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("scheduleId", new ParseUUIDPipe()) scheduleId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CancelTenantDeletionDto,
  ) {
    return this.operations.cancelDeletion(
      this.principal(request), tenantId, scheduleId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Put("tenants/:tenantId/entitlement-overrides")
  @UseGuards(MfaGuard)
  entitlementOverride(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: SetEntitlementOverrideDto,
  ) {
    return this.operations.setEntitlementOverride(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Put("tenants/:tenantId/usage-thresholds")
  @UseGuards(MfaGuard)
  usageThreshold(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: SetUsageThresholdDto,
  ) {
    return this.operations.setUsageThreshold(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Put("tenants/:tenantId/billing-link")
  @UseGuards(MfaGuard)
  billingLink(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: SetBillingLinkDto,
  ) {
    return this.operations.setBillingLink(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Get("support")
  support() {
    return this.operations.supportOverview();
  }

  @Post("support/cases")
  @UseGuards(MfaGuard)
  createSupportCase(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateSupportCaseDto,
  ) {
    return this.operations.createSupportCase(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("support/cases/:caseId/customer-approval")
  @UseGuards(MfaGuard)
  customerApproval(
    @Req() request: AuthenticatedRequest,
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: RecordCustomerApprovalDto,
  ) {
    return this.operations.recordCustomerApproval(
      this.principal(request), caseId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("support/cases/:caseId/elevation")
  @UseGuards(MfaGuard)
  startElevation(
    @Req() request: AuthenticatedRequest,
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: StartSupportElevationDto,
  ) {
    return this.operations.startElevation(
      this.principal(request), caseId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("support/sessions/:sessionId/terminate")
  @UseGuards(MfaGuard)
  terminateSession(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: TerminateSupportSessionDto,
  ) {
    return this.operations.terminateSession(
      this.principal(request), sessionId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("support/cases/:caseId/resolve")
  @UseGuards(MfaGuard)
  resolveSupportCase(
    @Req() request: AuthenticatedRequest,
    @Param("caseId", new ParseUUIDPipe()) caseId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ResolveSupportCaseDto,
  ) {
    return this.operations.resolveSupportCase(
      this.principal(request), caseId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("security-incidents")
  @UseGuards(MfaGuard)
  securityIncident(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: RecordSecurityIncidentDto,
  ) {
    return this.operations.recordSecurityIncident(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }
}
