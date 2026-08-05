import { Global, Module } from "@nestjs/common";
import { TenancyModule } from "../../modules/tenancy/tenancy.module.js";
import { FeatureFlagService } from "./feature-flag.service.js";
import { FeatureFlagsController } from "./feature-flags.controller.js";

@Global()
@Module({
  imports: [TenancyModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagService],
  exports: [FeatureFlagService],
})
export class FeatureFlagsModule {}
