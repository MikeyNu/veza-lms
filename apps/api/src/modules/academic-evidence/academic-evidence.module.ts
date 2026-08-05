import { Module } from "@nestjs/common";
import { AcademicEvidenceService } from "./application/academic-evidence.service.js";
import { AcademicEvidenceController } from "./http/academic-evidence.controller.js";
import { PublicCertificateController } from "./http/public-certificate.controller.js";

@Module({
  controllers: [AcademicEvidenceController, PublicCertificateController],
  providers: [AcademicEvidenceService],
  exports: [AcademicEvidenceService],
})
export class AcademicEvidenceModule {}
