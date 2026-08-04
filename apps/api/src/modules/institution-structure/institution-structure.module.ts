import { Module } from "@nestjs/common";
import { InstitutionQueryService } from "./application/institution-query.service.js";
import { InstitutionStructureService } from "./application/institution-structure.service.js";
import { TenantActivationService } from "./application/tenant-activation.service.js";
import { InstitutionSetupController } from "./http/institution-setup.controller.js";

@Module({
  controllers: [InstitutionSetupController],
  providers: [InstitutionQueryService, InstitutionStructureService, TenantActivationService],
})
export class InstitutionStructureModule {}
