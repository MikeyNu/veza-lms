import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { ReleaseGovernanceService } from "../application/release-governance.service.js";

@Controller("control-plane/release-governance")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneReleaseGovernanceController {
  constructor(private readonly releases: ReleaseGovernanceService) {}

  @Get()
  overview() {
    return this.releases.overview();
  }

  @Get("tenants/:tenantId")
  tenant(@Param("tenantId", new ParseUUIDPipe()) tenantId: string) {
    return this.releases.tenant(tenantId);
  }
}
