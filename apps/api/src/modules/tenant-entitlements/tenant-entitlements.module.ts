import { Module } from "@nestjs/common";
import { ProvisionTenantService } from "./application/provision-tenant.service.js";
import { ControlPlaneTenantsController } from "./http/control-plane-tenants.controller.js";

@Module({ controllers: [ControlPlaneTenantsController], providers: [ProvisionTenantService] })
export class TenantEntitlementsModule {}
