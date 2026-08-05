import { Module } from "@nestjs/common";
import { AcademicEvidenceModule } from "./modules/academic-evidence/academic-evidence.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { CatalogueModule } from "./modules/catalogue/catalogue.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { IdentityAccessModule } from "./modules/identity-access/identity-access.module.js";
import { InstitutionStructureModule } from "./modules/institution-structure/institution-structure.module.js";
import { LearnerCourseModule } from "./modules/learner-course/learner-course.module.js";
import { PeopleModule } from "./modules/people/people.module.js";
import { PlatformOperationsModule } from "./modules/platform-operations/platform-operations.module.js";
import { StudioModule } from "./modules/studio/studio.module.js";
import { TenantEntitlementsModule } from "./modules/tenant-entitlements/tenant-entitlements.module.js";
import { TenancyModule } from "./modules/tenancy/tenancy.module.js";
import { TerminologyModule } from "./modules/terminology/terminology.module.js";
import { AuthenticationModule } from "./platform/authentication/authentication.module.js";
import { AuthorizationModule } from "./platform/authorization/authorization.module.js";
import { CommunicationsModule } from "./platform/communications/communications.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { EventsModule } from "./platform/events/events.module.js";
import { FeatureFlagsModule } from "./platform/feature-flags/feature-flags.module.js";
import { RequestContextModule } from "./platform/request-context/request-context.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthenticationModule,
    AuthorizationModule,
    RequestContextModule,
    AuditModule,
    EventsModule,
    CommunicationsModule,
    FeatureFlagsModule,
    PlatformOperationsModule,
    IdentityAccessModule,
    InstitutionStructureModule,
    PeopleModule,
    TerminologyModule,
    CatalogueModule,
    StudioModule,
    LearnerCourseModule,
    AcademicEvidenceModule,
    TenancyModule,
    TenantEntitlementsModule,
    HealthModule,
  ],
})
export class AppModule {}
