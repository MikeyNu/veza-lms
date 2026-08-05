import { Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import { CreateFeatureFlagService } from "./create-feature-flag.service.js";
import { FeatureFlagLifecycleService } from "./feature-flag-lifecycle.service.js";
import type { ChangeFeatureFlagLifecycleDto, ConfigureRingFlagDto, CreateFeatureFlagDto } from "./release-governance-mutations.dto.js";
import { RingFeatureConfigurationService } from "./ring-feature-configuration.service.js";

@Injectable()
export class FeatureFlagMutationsService {
  constructor(
    private readonly createFlag: CreateFeatureFlagService,
    private readonly lifecycle: FeatureFlagLifecycleService,
    private readonly ringConfiguration: RingFeatureConfigurationService,
  ) {}
  create(principal: AuthenticatedPrincipal, input: CreateFeatureFlagDto, key: string, correlationId: string) {
    return this.createFlag.execute(principal, input, key, correlationId);
  }
  changeLifecycle(principal: AuthenticatedPrincipal, flagKey: string, input: ChangeFeatureFlagLifecycleDto, key: string, correlationId: string) {
    return this.lifecycle.execute(principal, flagKey, input, key, correlationId);
  }
  configureRing(principal: AuthenticatedPrincipal, ringKey: string, flagKey: string, input: ConfigureRingFlagDto, key: string, correlationId: string) {
    return this.ringConfiguration.execute(principal, ringKey, flagKey, input, key, correlationId);
  }
}
