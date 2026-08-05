import { Module } from "@nestjs/common";
import { DeadLetterOperationsService } from "./application/dead-letter-operations.service.js";
import { PlanOperationsService } from "./application/plan-operations.service.js";
import { PlatformAuditQueryService } from "./application/platform-audit-query.service.js";
import { PlatformAuditWriter } from "./application/platform-audit-writer.service.js";
import { ControlPlaneDeadLettersController } from "./http/control-plane-dead-letters.controller.js";
import { ControlPlanePlansController } from "./http/control-plane-plans.controller.js";
import { PlatformAuditController } from "./http/platform-audit.controller.js";

@Module({
  controllers: [PlatformAuditController, ControlPlanePlansController, ControlPlaneDeadLettersController],
  providers: [PlatformAuditQueryService, PlatformAuditWriter, PlanOperationsService, DeadLetterOperationsService],
  exports: [PlatformAuditWriter],
})
export class PlatformOperationsModule {}
