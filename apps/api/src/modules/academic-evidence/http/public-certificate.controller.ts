import { Controller, Get, Param } from "@nestjs/common";
import { AcademicEvidenceService } from "../application/academic-evidence.service.js";

@Controller("public/certificates")
export class PublicCertificateController {
  constructor(private readonly service: AcademicEvidenceService) {}

  @Get(":verificationCode")
  verify(@Param("verificationCode") verificationCode: string) {
    return this.service.verifyCertificate(verificationCode);
  }
}
