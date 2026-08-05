import { Module } from "@nestjs/common";
import { CatalogueService } from "./application/catalogue.service.js";
import { CatalogueController } from "./http/catalogue.controller.js";

@Module({
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
