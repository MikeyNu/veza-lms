import { Module } from "@nestjs/common";
import { AcademicEvidenceService } from "./application/academic-evidence.service.js";
import { AcademicEvidenceController } from "./http/academic-evidence.controller.js";

@Module({
  controllers: [AcademicEvidenceController],
  providers: [AcademicEvidenceService],
  exports: [AcademicEvidenceService],
})
export class AcademicEvidenceModule {}
