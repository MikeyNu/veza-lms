import { Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import { FeatureFlagMutationsService } from "./feature-flag-mutations.service.js";
import type {
  AssignTenantReleaseRingDto,
  ChangeFeatureFlagLifecycleDto,
  ConfigureRingFlagDto,
  ConfigureTenantFlagDto,
  CreateFeatureFlagDto,
} from "./release-governance-mutations.dto.js";
import { TenantReleaseMutationsService } from "./tenant-release-mutations.service.js";

@Injectable()
export class ReleaseGovernanceMutationsService {
  constructor(
    private readonly featureFlags: FeatureFlagMutationsService,
    private readonly tenants: TenantReleaseMutationsService,
  ) {}

  createFeatureFlag(principal: AuthenticatedPrincipal, input: CreateFeatureFlagDto, key: string, correlationId: string) {
    return this.featureFlags.create(principal, input, key, correlationId);
  }

  changeFeatureFlagLifecycle(principal: AuthenticatedPrincipal, flagKey: string, input: ChangeFeatureFlagLifecycleDto, key: string, correlationId: string) {
    return this.featureFlags.changeLifecycle(principal, flagKey, input, key, correlationId);
  }

  configureRingFlag(principal: AuthenticatedPrincipal, ringKey: string, flagKey: string, input: ConfigureRingFlagDto, key: string, correlationId: string) {
    return this.featureFlags.configureRing(principal, ringKey, flagKey, input, key, correlationId);
  }

  assignTenantRing(principal: AuthenticatedPrincipal, tenantId: string, input: AssignTenantReleaseRingDto, key: string, correlationId: string) {
    return this.tenants.assignRing(principal, tenantId, input, key, correlationId);
  }

  configureTenantFlag(principal: AuthenticatedPrincipal, tenantId: string, flagKey: string, input: ConfigureTenantFlagDto, key: string, correlationId: string) {
    return this.tenants.configureFlag(principal, tenantId, flagKey, input, key, correlationId);
  }
}
