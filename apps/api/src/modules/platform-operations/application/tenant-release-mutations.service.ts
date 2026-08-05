import { Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { AssignTenantReleaseRingDto, ConfigureTenantFlagDto } from "./release-governance-mutations.dto.js";
import { TenantFeatureOverrideService } from "./tenant-feature-override.service.js";
import { TenantRingAssignmentService } from "./tenant-ring-assignment.service.js";

@Injectable()
export class TenantReleaseMutationsService {
  constructor(private readonly rings: TenantRingAssignmentService, private readonly flags: TenantFeatureOverrideService) {}
  assignRing(principal: AuthenticatedPrincipal, tenantId: string, input: AssignTenantReleaseRingDto, key: string, correlationId: string) {
    return this.rings.execute(principal, tenantId, input, key, correlationId);
  }
  configureFlag(principal: AuthenticatedPrincipal, tenantId: string, flagKey: string, input: ConfigureTenantFlagDto, key: string, correlationId: string) {
    return this.flags.execute(principal, tenantId, flagKey, input, key, correlationId);
  }
}
