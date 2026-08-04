import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./authenticated-request.js";

export const PLATFORM_OPERATOR_ROLE = "veza:platform-operator";

@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException("Authentication is required");
    if (!request.principal.platformRoles.includes(PLATFORM_OPERATOR_ROLE)) {
      throw new ForbiddenException("Platform operator access is required");
    }
    return true;
  }
}
