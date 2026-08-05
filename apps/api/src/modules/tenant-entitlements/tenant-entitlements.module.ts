import { Module } from "@nestjs/common";
import { PlatformOperationsModule } from "../platform-operations/platform-operations.module.js";
import { ProvisionTenantService } from "./application/provision-tenant.service.js";
import { TenantOperationsService } from "./application/tenant-operations.service.js";
import { ControlPlaneTenantsController } from "./http/control-plane-tenants.controller.js";

@Module({
  imports: [PlatformOperationsModule],
  controllers: [ControlPlaneTenantsController],
  providers: [ProvisionTenantService, TenantOperationsService],
})
export class TenantEntitlementsModule {}
