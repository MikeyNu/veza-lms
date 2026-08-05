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
import type { CommercialGovernanceService } from "../application/commercial-governance.service.js";
import {
  AssignTenantPlanDto,
  CreatePlanPolicyDto,
  CreateReleaseVersionDto,
  CreateRollbackDecisionDto,
  RecordReleaseCompatibilityDto,
  SetReleaseRingTargetDto,
  SetTenantReleaseExceptionDto,
  TransitionPlanPolicyDto,
  TransitionReleaseRingTargetDto,
  TransitionReleaseVersionDto,
  UpdateTenantMigrationDto,
  UpsertModuleCatalogueDto,
} from "../application/commercial-release-governance.dto.js";
import type { ReleaseCompletionService } from "../application/release-completion.service.js";

@Controller("control-plane/commercial-governance")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneCommercialGovernanceController {
  constructor(private readonly commercial: CommercialGovernanceService) {}

  @Get("overview")
  overview() {
    return this.commercial.overview();
  }

  @Put("modules")
  @UseGuards(MfaGuard)
  module(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: UpsertModuleCatalogueDto,
  ) {
    return this.commercial.upsertModule(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("plan-policies")
  @UseGuards(MfaGuard)
  createPolicy(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreatePlanPolicyDto,
  ) {
    return this.commercial.createPolicy(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("plan-policies/:policyId/transition")
  @UseGuards(MfaGuard)
  transitionPolicy(
    @Req() request: AuthenticatedRequest,
    @Param("policyId", new ParseUUIDPipe()) policyId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: TransitionPlanPolicyDto,
  ) {
    return this.commercial.transitionPolicy(
      this.principal(request), policyId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("tenants/:tenantId/plan-assignment")
  @UseGuards(MfaGuard)
  assignPlan(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: AssignTenantPlanDto,
  ) {
    return this.commercial.assignTenantPlan(
      this.principal(request), tenantId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }
}

@Controller("control-plane/release-completion")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneReleaseCompletionController {
  constructor(private readonly releases: ReleaseCompletionService) {}

  @Get("overview")
  overview() {
    return this.releases.overview();
  }

  @Post("versions")
  @UseGuards(MfaGuard)
  createVersion(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateReleaseVersionDto,
  ) {
    return this.releases.createVersion(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("versions/:versionKey/transition")
  @UseGuards(MfaGuard)
  transitionVersion(
    @Req() request: AuthenticatedRequest,
    @Param("versionKey") versionKey: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: TransitionReleaseVersionDto,
  ) {
    if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(versionKey)) {
      throw new Error("Release version is invalid");
    }
    return this.releases.transitionVersion(
      this.principal(request), versionKey, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("ring-targets")
  @UseGuards(MfaGuard)
  ringTarget(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: SetReleaseRingTargetDto,
  ) {
    return this.releases.createRingTarget(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("ring-targets/:targetId/transition")
  @UseGuards(MfaGuard)
  transitionRingTarget(
    @Req() request: AuthenticatedRequest,
    @Param("targetId", new ParseUUIDPipe()) targetId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: TransitionReleaseRingTargetDto,
  ) {
    return this.releases.transitionRingTarget(
      this.principal(request), targetId, input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Put("tenant-exception")
  @UseGuards(MfaGuard)
  tenantException(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: SetTenantReleaseExceptionDto,
  ) {
    return this.releases.setTenantException(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("compatibility")
  @UseGuards(MfaGuard)
  compatibility(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: RecordReleaseCompatibilityDto,
  ) {
    return this.releases.recordCompatibility(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Put("migration")
  @UseGuards(MfaGuard)
  migration(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: UpdateTenantMigrationDto,
  ) {
    return this.releases.updateMigration(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("rollbacks")
  @UseGuards(MfaGuard)
  rollback(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: CreateRollbackDecisionDto,
  ) {
    return this.releases.createRollback(
      this.principal(request), input, idempotencyKey ?? "", request.correlationId,
    );
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }
}
