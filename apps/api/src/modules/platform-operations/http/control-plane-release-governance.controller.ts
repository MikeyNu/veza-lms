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
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import {
  AssignTenantReleaseRingDto,
  ChangeFeatureFlagLifecycleDto,
  ConfigureRingFlagDto,
  ConfigureTenantFlagDto,
  CreateFeatureFlagDto,
} from "../application/release-governance-mutations.dto.js";
import { ReleaseGovernanceMutationsService } from "../application/release-governance-mutations.service.js";
import { ReleaseGovernanceService } from "../application/release-governance.service.js";

@Controller("control-plane/release-governance")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneReleaseGovernanceController {
  constructor(
    private readonly releases: ReleaseGovernanceService,
    private readonly mutations: ReleaseGovernanceMutationsService,
  ) {}

  @Get()
  overview() {
    return this.releases.overview();
  }

  @Get("tenants/:tenantId")
  tenant(@Param("tenantId", new ParseUUIDPipe()) tenantId: string) {
    return this.releases.tenant(tenantId);
  }

  @Post("feature-flags")
  createFeatureFlag(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateFeatureFlagDto,
  ) {
    return this.mutations.createFeatureFlag(
      this.principal(request), input, idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post("feature-flags/:flagKey/lifecycle")
  changeFeatureFlagLifecycle(
    @Req() request: AuthenticatedRequest,
    @Param("flagKey") flagKey: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ChangeFeatureFlagLifecycleDto,
  ) {
    return this.mutations.changeFeatureFlagLifecycle(
      this.principal(request), flagKey, input, idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Put("release-rings/:ringKey/feature-flags/:flagKey")
  configureRingFlag(
    @Req() request: AuthenticatedRequest,
    @Param("ringKey") ringKey: string,
    @Param("flagKey") flagKey: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ConfigureRingFlagDto,
  ) {
    return this.mutations.configureRingFlag(
      this.principal(request), ringKey, flagKey, input, idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Put("tenants/:tenantId/release-ring")
  assignTenantRing(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: AssignTenantReleaseRingDto,
  ) {
    return this.mutations.assignTenantRing(
      this.principal(request), tenantId, input, idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Put("tenants/:tenantId/feature-flags/:flagKey")
  configureTenantFlag(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Param("flagKey") flagKey: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ConfigureTenantFlagDto,
  ) {
    return this.mutations.configureTenantFlag(
      this.principal(request), tenantId, flagKey, input, idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }
}
