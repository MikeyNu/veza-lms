import { Body, Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { ProvisionTenantDto } from "../application/provision-tenant.dto.js";
import { ProvisionTenantService } from "../application/provision-tenant.service.js";

@Controller("control-plane/tenants")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneTenantsController {
  constructor(private readonly provisioning: ProvisionTenantService) {}

  @Post()
  provision(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ProvisionTenantDto,
  ) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return this.provisioning.execute(
      request.principal,
      input,
      idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }
}
