import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../platform/authentication/authenticated-request.js";
import { TenantContext } from "../../platform/request-context/tenant-context.js";

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException("Authentication is required");
    if (!request.workspaceSession || !this.tenantContext.current()) {
      throw new ForbiddenException("An active tenant membership must be selected");
    }
    return true;
  }
}
