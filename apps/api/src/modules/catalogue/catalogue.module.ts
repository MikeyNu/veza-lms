import { Module } from "@nestjs/common";
import { CatalogueGovernanceService } from "./application/catalogue-governance.service.js";
import { CatalogueReferenceService } from "./application/catalogue-reference.service.js";
import { CatalogueService } from "./application/catalogue.service.js";
import { CatalogueGovernanceController } from "./http/catalogue-governance.controller.js";
import { CatalogueController } from "./http/catalogue.controller.js";

@Module({
  controllers: [CatalogueController, CatalogueGovernanceController],
  providers: [CatalogueService, CatalogueReferenceService, CatalogueGovernanceService],
  exports: [CatalogueService, CatalogueReferenceService, CatalogueGovernanceService],
})
export class CatalogueModule {}
