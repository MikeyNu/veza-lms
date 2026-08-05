import { Module } from "@nestjs/common";
import { PlanOperationsService } from "./application/plan-operations.service.js";
import { PlatformAuditQueryService } from "./application/platform-audit-query.service.js";
import { PlatformAuditWriter } from "./application/platform-audit-writer.service.js";
import { ControlPlanePlansController } from "./http/control-plane-plans.controller.js";
import { PlatformAuditController } from "./http/platform-audit.controller.js";

@Module({
  controllers: [PlatformAuditController, ControlPlanePlansController],
  providers: [PlatformAuditQueryService, PlatformAuditWriter, PlanOperationsService],
  exports: [PlatformAuditWriter],
})
export class PlatformOperationsModule {}
