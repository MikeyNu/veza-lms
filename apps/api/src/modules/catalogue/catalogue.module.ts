import { Module } from "@nestjs/common";
import { CatalogueReferenceService } from "./application/catalogue-reference.service.js";
import { CatalogueService } from "./application/catalogue.service.js";
import { CatalogueController } from "./http/catalogue.controller.js";

@Module({
  controllers: [CatalogueController],
  providers: [CatalogueService, CatalogueReferenceService],
  exports: [CatalogueService, CatalogueReferenceService],
})
export class CatalogueModule {}
