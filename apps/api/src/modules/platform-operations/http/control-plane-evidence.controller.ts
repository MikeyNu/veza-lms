import {
  Body,
  Controller,
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
  TransitionSecurityIncidentDto,
  UpdateTenantHealthDto,
} from "../application/control-plane-completion.dto.js";
import { ControlPlaneEvidenceService } from "../application/control-plane-evidence.service.js";

@Controller("control-plane/operations")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneEvidenceController {
  constructor(private readonly evidence: ControlPlaneEvidenceService) {}

  @Put("tenants/:tenantId/health")
  @UseGuards(MfaGuard)
  updateTenantHealth(
    @Req() request: AuthenticatedRequest,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: UpdateTenantHealthDto,
  ) {
    return this.evidence.updateTenantHealth(
      this.principal(request), tenantId, input,
      idempotencyKey ?? "", request.correlationId,
    );
  }

  @Post("security-incidents/:incidentId/transition")
  @UseGuards(MfaGuard)
  transitionSecurityIncident(
    @Req() request: AuthenticatedRequest,
    @Param("incidentId", new ParseUUIDPipe()) incidentId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: TransitionSecurityIncidentDto,
  ) {
    return this.evidence.transitionSecurityIncident(
      this.principal(request), incidentId, input,
      idempotencyKey ?? "", request.correlationId,
    );
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }
}
