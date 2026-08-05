import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./authenticated-request.js";

@Injectable()
export class MfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException("Authentication is required");
    if (!request.principal.authenticationMethods.includes("mfa")) {
      throw new ForbiddenException("Multi-factor authentication is required for this action");
    }
    return true;
  }
}
