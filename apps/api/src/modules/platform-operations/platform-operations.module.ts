import { Module } from "@nestjs/common";
import { ControlPlaneCompletionService } from "./application/control-plane-completion.service.js";
import { CreateFeatureFlagService } from "./application/create-feature-flag.service.js";
import { DeadLetterOperationsService } from "./application/dead-letter-operations.service.js";
import { FeatureFlagLifecycleService } from "./application/feature-flag-lifecycle.service.js";
import { FeatureFlagMutationsService } from "./application/feature-flag-mutations.service.js";
import { PlanOperationsService } from "./application/plan-operations.service.js";
import { PlatformAuditQueryService } from "./application/platform-audit-query.service.js";
import { PlatformAuditWriter } from "./application/platform-audit-writer.service.js";
import { PlatformOperationExecutor } from "./application/release-governance-mutation-support.js";
import { ReleaseGovernanceMutationsService } from "./application/release-governance-mutations.service.js";
import { ReleaseGovernanceService } from "./application/release-governance.service.js";
import { RingFeatureConfigurationService } from "./application/ring-feature-configuration.service.js";
import { TenantFeatureOverrideService } from "./application/tenant-feature-override.service.js";
import { TenantReleaseMutationsService } from "./application/tenant-release-mutations.service.js";
import { TenantRingAssignmentService } from "./application/tenant-ring-assignment.service.js";
import { ControlPlaneCompletionController } from "./http/control-plane-completion.controller.js";
import { ControlPlaneDeadLettersController } from "./http/control-plane-dead-letters.controller.js";
import { ControlPlanePlansController } from "./http/control-plane-plans.controller.js";
import { ControlPlaneReleaseGovernanceController } from "./http/control-plane-release-governance.controller.js";
import { PlatformAuditController } from "./http/platform-audit.controller.js";

@Module({
  controllers: [
    PlatformAuditController,
    ControlPlanePlansController,
    ControlPlaneDeadLettersController,
    ControlPlaneReleaseGovernanceController,
    ControlPlaneCompletionController,
  ],
  providers: [
    PlatformAuditQueryService,
    PlatformAuditWriter,
    PlanOperationsService,
    DeadLetterOperationsService,
    ReleaseGovernanceService,
    PlatformOperationExecutor,
    CreateFeatureFlagService,
    FeatureFlagLifecycleService,
    RingFeatureConfigurationService,
    FeatureFlagMutationsService,
    TenantRingAssignmentService,
    TenantFeatureOverrideService,
    TenantReleaseMutationsService,
    ReleaseGovernanceMutationsService,
    ControlPlaneCompletionService,
  ],
  exports: [PlatformAuditWriter],
})
export class PlatformOperationsModule {}
