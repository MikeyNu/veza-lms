import { Module } from "@nestjs/common";
import { AuditModule } from "./modules/audit/audit.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { IdentityAccessModule } from "./modules/identity-access/identity-access.module.js";
import { InstitutionStructureModule } from "./modules/institution-structure/institution-structure.module.js";
import { TenantEntitlementsModule } from "./modules/tenant-entitlements/tenant-entitlements.module.js";
import { TenancyModule } from "./modules/tenancy/tenancy.module.js";
import { AuthenticationModule } from "./platform/authentication/authentication.module.js";
import { AuthorizationModule } from "./platform/authorization/authorization.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { EventsModule } from "./platform/events/events.module.js";
import { RequestContextModule } from "./platform/request-context/request-context.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthenticationModule,
    AuthorizationModule,
    RequestContextModule,
    AuditModule,
    EventsModule,
    IdentityAccessModule,
    InstitutionStructureModule,
    TenancyModule,
    TenantEntitlementsModule,
    HealthModule,
  ],
})
export class AppModule {}
