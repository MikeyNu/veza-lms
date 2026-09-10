import { Module } from "@nestjs/common";
import { CatalogueAnalysisService } from "./application/catalogue-analysis.service.js";
import { CatalogueDefinitionService } from "./application/catalogue-definition.service.js";
import { CatalogueGovernanceService } from "./application/catalogue-governance.service.js";
import { CatalogueReferenceService } from "./application/catalogue-reference.service.js";
import { CatalogueService } from "./application/catalogue.service.js";
import { CatalogueWorkspaceQueryService } from "./application/catalogue-workspace-query.service.js";
import { CurriculumApprovalService } from "./application/curriculum-approval.service.js";
import { DeliveryCompletionService } from "./application/delivery-completion.service.js";
import { DeliveryTimetableQueryService } from "./application/delivery-timetable-query.service.js";
import { CatalogueGovernanceController } from "./http/catalogue-governance.controller.js";
import { CatalogueController } from "./http/catalogue.controller.js";
import { DeliveryCompletionController } from "./http/delivery-completion.controller.js";
import { DeliveryTimetableQueryController } from "./http/delivery-timetable-query.controller.js";

@Module({
  controllers: [
    CatalogueController,
    CatalogueGovernanceController,
    DeliveryCompletionController,
    DeliveryTimetableQueryController,
  ],
  providers: [
    CatalogueService,
    CatalogueWorkspaceQueryService,
    CatalogueReferenceService,
    CatalogueGovernanceService,
    CatalogueDefinitionService,
    CatalogueAnalysisService,
    CurriculumApprovalService,
    DeliveryCompletionService,
    DeliveryTimetableQueryService,
  ],
  exports: [
    CatalogueService,
    CatalogueWorkspaceQueryService,
    CatalogueReferenceService,
    CatalogueGovernanceService,
    CatalogueAnalysisService,
    DeliveryCompletionService,
    DeliveryTimetableQueryService,
  ],
})
export class CatalogueModule {}
