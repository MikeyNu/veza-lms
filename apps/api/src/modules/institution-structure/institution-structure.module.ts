import { Module } from "@nestjs/common";
import { InstitutionStructureService } from "./application/institution-structure.service.js";
import { TenantActivationService } from "./application/tenant-activation.service.js";
import { InstitutionSetupController } from "./http/institution-setup.controller.js";

@Module({
  controllers: [InstitutionSetupController],
  providers: [InstitutionStructureService, TenantActivationService],
})
export class InstitutionStructureModule {}
