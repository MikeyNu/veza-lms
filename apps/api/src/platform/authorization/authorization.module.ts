import { Global, Module } from "@nestjs/common";
import { TenantAuthorizationService } from "./tenant-authorization.service.js";
import { TenantPermissionGuard } from "./tenant-permission.guard.js";

@Global()
@Module({
  providers: [TenantAuthorizationService, TenantPermissionGuard],
  exports: [TenantAuthorizationService, TenantPermissionGuard],
})
export class AuthorizationModule {}
