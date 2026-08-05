import { Module } from "@nestjs/common";
import { DeadLetterOperationsService } from "./application/dead-letter-operations.service.js";
import { PlanOperationsService } from "./application/plan-operations.service.js";
import { PlatformAuditQueryService } from "./application/platform-audit-query.service.js";
import { PlatformAuditWriter } from "./application/platform-audit-writer.service.js";
import { ReleaseGovernanceService } from "./application/release-governance.service.js";
import { ControlPlaneDeadLettersController } from "./http/control-plane-dead-letters.controller.js";
import { ControlPlanePlansController } from "./http/control-plane-plans.controller.js";
import { ControlPlaneReleaseGovernanceController } from "./http/control-plane-release-governance.controller.js";
import { PlatformAuditController } from "./http/platform-audit.controller.js";

@Module({
  controllers: [
    PlatformAuditController,
    ControlPlanePlansController,
    ControlPlaneDeadLettersController,
    ControlPlaneReleaseGovernanceController,
  ],
  providers: [
    PlatformAuditQueryService,
    PlatformAuditWriter,
    PlanOperationsService,
    DeadLetterOperationsService,
    ReleaseGovernanceService,
  ],
  exports: [PlatformAuditWriter],
})
export class PlatformOperationsModule {}
