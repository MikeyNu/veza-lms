import { Module } from "@nestjs/common";
import { AcademicEvidenceQueryService } from "./application/academic-evidence-query.service.js";
import { AcademicEvidenceService } from "./application/academic-evidence.service.js";
import { AcademicEvidenceController } from "./http/academic-evidence.controller.js";
import { AcademicEvidenceQueryController } from "./http/academic-evidence-query.controller.js";
import { PublicCertificateController } from "./http/public-certificate.controller.js";

@Module({
  controllers: [AcademicEvidenceController, AcademicEvidenceQueryController, PublicCertificateController],
  providers: [AcademicEvidenceService, AcademicEvidenceQueryService],
  exports: [AcademicEvidenceService, AcademicEvidenceQueryService],
})
export class AcademicEvidenceModule {}
