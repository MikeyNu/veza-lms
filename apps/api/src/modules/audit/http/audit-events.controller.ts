import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { RequiresTenantPermission } from "../../../platform/authorization/requires-tenant-permission.decorator.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { AuditQueryService } from "../application/audit-query.service.js";
import { ListAuditEventsDto } from "../application/list-audit-events.dto.js";

@Controller("audit-events")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class AuditEventsController {
  constructor(private readonly auditEvents: AuditQueryService) {}

  @Get()
  @RequiresTenantPermission(permissions.auditRead)
  list(@Query() input: ListAuditEventsDto) {
    return this.auditEvents.list(input);
  }
}
