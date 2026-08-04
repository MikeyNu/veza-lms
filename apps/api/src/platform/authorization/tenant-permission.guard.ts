import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { TenantAuthorizationService } from "./tenant-authorization.service.js";
import { TENANT_PERMISSION_METADATA } from "./requires-tenant-permission.decorator.js";

@Injectable()
export class TenantPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission>(TENANT_PERMISSION_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    this.authorization.assertPermission(request, permission);
    return true;
  }
}
