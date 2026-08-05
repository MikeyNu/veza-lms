import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { ListPlatformAuditEventsDto } from "../application/list-platform-audit-events.dto.js";
import { PlatformAuditQueryService } from "../application/platform-audit-query.service.js";

@Controller("control-plane/audit-events")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class PlatformAuditController {
  constructor(private readonly query: PlatformAuditQueryService) {}

  @Get()
  list(@Query() input: ListPlatformAuditEventsDto) {
    return this.query.list(input);
  }
}
