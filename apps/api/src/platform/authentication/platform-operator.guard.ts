import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./authenticated-request.js";
import {
  hasPlatformOperatorAssurance,
  PLATFORM_OPERATOR_ROLE,
  requiredPlatformOperatorMethods,
} from "./platform-operator-assurance.js";

export { PLATFORM_OPERATOR_ROLE };

@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException("Authentication is required");
    if (!request.principal.platformRoles.includes(PLATFORM_OPERATOR_ROLE)) {
      throw new ForbiddenException("Platform operator access is required");
    }
    if (!hasPlatformOperatorAssurance(request.principal)) {
      throw new ForbiddenException(
        `Platform operator access requires ${requiredPlatformOperatorMethods().join(" and ")} authentication assurance`,
      );
    }
    return true;
  }
}
