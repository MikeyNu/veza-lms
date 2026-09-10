import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { RequiresTenantPermission } from "../../../platform/authorization/requires-tenant-permission.decorator.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { LearnerCalendarService } from "../application/learner-calendar.service.js";

@Controller("learner/calendar")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
@RequiresTenantPermission(permissions.learnerCourseRead)
export class LearnerCalendarController {
  constructor(private readonly calendarService: LearnerCalendarService) {}

  @Get()
  calendar(@Query("from") from?: string, @Query("to") to?: string) {
    return this.calendarService.calendar(from, to);
  }
}
