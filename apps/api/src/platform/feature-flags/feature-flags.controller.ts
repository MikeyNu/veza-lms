import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { TenantMembershipGuard } from "../../modules/tenancy/tenant-membership.guard.js";
import { FeatureFlagService } from "./feature-flag.service.js";

@Controller("feature-flags")
@UseGuards(AuthenticationGuard, TenantMembershipGuard)
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagService) {}

  @Get()
  list() {
    return this.flags.list();
  }
}
