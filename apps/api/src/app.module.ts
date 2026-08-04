import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module.js";
import { TenancyModule } from "./modules/tenancy/tenancy.module.js";

@Module({ imports: [TenancyModule, HealthModule] })
export class AppModule {}
