import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { PlatformOperationsModule } from "../platform-operations/platform-operations.module.js";
import { ProvisionTenantService } from "./application/provision-tenant.service.js";
import { TenantOperationsService } from "./application/tenant-operations.service.js";
import { ControlPlaneTenantsController } from "./http/control-plane-tenants.controller.js";

@Module({
  // ProvisionTenantService injects InvitationTokenService, which IdentityAccessModule owns.
  imports: [PlatformOperationsModule, IdentityAccessModule],
  controllers: [ControlPlaneTenantsController],
  providers: [ProvisionTenantService, TenantOperationsService],
})
export class TenantEntitlementsModule {}
