import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { TenantMembershipGuard } from "./tenant-membership.guard.js";
import { TenantRequestContextMiddleware } from "./tenant-request-context.middleware.js";

@Module({
  imports: [IdentityAccessModule],
  providers: [TenantRequestContextMiddleware, TenantMembershipGuard],
  exports: [TenantMembershipGuard],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantRequestContextMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
