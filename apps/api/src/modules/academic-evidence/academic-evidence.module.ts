import { Module } from "@nestjs/common";
import { AcademicEvidenceQueryService } from "./application/academic-evidence-query.service.js";
import { AcademicEvidenceService } from "./application/academic-evidence.service.js";
import { AcademicGovernanceService } from "./application/academic-governance.service.js";
import { CredentialDefinitionService } from "./application/credential-definition.service.js";
import { LearnerSubmissionService } from "./application/learner-submission.service.js";
import { AcademicEvidenceController } from "./http/academic-evidence.controller.js";
import { AcademicEvidenceQueryController } from "./http/academic-evidence-query.controller.js";
import { CredentialDefinitionController } from "./http/credential-definition.controller.js";
import { PublicCertificateController } from "./http/public-certificate.controller.js";

@Module({
  controllers: [
    AcademicEvidenceController,
    AcademicEvidenceQueryController,
    CredentialDefinitionController,
    PublicCertificateController,
  ],
  providers: [
    AcademicEvidenceService,
    AcademicEvidenceQueryService,
    AcademicGovernanceService,
    CredentialDefinitionService,
    LearnerSubmissionService,
  ],
  exports: [
    AcademicEvidenceService,
    AcademicEvidenceQueryService,
    AcademicGovernanceService,
    CredentialDefinitionService,
    LearnerSubmissionService,
  ],
})
export class AcademicEvidenceModule {}
