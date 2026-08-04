import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest } from "./authenticated-request.js";

@Injectable()
export class ExternalAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.externalPrincipal) throw new UnauthorizedException("Authentication is required");
    return true;
  }
}
