import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { PlanOperationsService } from "../application/plan-operations.service.js";

@Controller("control-plane/plans")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlanePlansController {
  constructor(private readonly plans: PlanOperationsService) {}

  @Get()
  list() {
    return this.plans.list();
  }
}
