import { Module } from "@nestjs/common";
import { CatalogueAnalysisService } from "./application/catalogue-analysis.service.js";
import { CatalogueDefinitionService } from "./application/catalogue-definition.service.js";
import { CatalogueGovernanceService } from "./application/catalogue-governance.service.js";
import { CatalogueReferenceService } from "./application/catalogue-reference.service.js";
import { CatalogueService } from "./application/catalogue.service.js";
import { CatalogueWorkspaceQueryService } from "./application/catalogue-workspace-query.service.js";
import { CurriculumApprovalService } from "./application/curriculum-approval.service.js";
import { CatalogueGovernanceController } from "./http/catalogue-governance.controller.js";
import { CatalogueController } from "./http/catalogue.controller.js";

@Module({
  controllers: [CatalogueController, CatalogueGovernanceController],
  providers: [
    CatalogueService,
    CatalogueWorkspaceQueryService,
    CatalogueReferenceService,
    CatalogueGovernanceService,
    CatalogueDefinitionService,
    CatalogueAnalysisService,
    CurriculumApprovalService,
  ],
  exports: [
    CatalogueService,
    CatalogueWorkspaceQueryService,
    CatalogueReferenceService,
    CatalogueGovernanceService,
    CatalogueAnalysisService,
  ],
})
export class CatalogueModule {}
