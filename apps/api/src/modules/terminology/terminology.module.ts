import { Module } from "@nestjs/common";
import { TerminologyService } from "./application/terminology.service.js";
import { TerminologyController } from "./http/terminology.controller.js";

@Module({
  controllers: [TerminologyController],
  providers: [TerminologyService],
  exports: [TerminologyService],
})
export class TerminologyModule {}
