import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { TenantId } from "@veza/contracts";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { ListTenantsDto } from "../application/list-tenants.dto.js";
import { ProvisionTenantDto } from "../application/provision-tenant.dto.js";
import { ProvisionTenantService } from "../application/provision-tenant.service.js";
import { TenantOperationsService } from "../application/tenant-operations.service.js";

@Controller("control-plane/tenants")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneTenantsController {
  constructor(
    private readonly provisioning: ProvisionTenantService,
    private readonly operations: TenantOperationsService,
  ) {}

  @Get()
  list(@Query() input: ListTenantsDto) {
    return this.operations.list(input);
  }

  @Get(":tenantId")
  detail(@Param("tenantId", new ParseUUIDPipe({ version: "4" })) tenantId: TenantId) {
    return this.operations.detail(tenantId);
  }

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
