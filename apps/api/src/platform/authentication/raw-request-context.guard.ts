import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

/**
 * Nest middleware registered through MiddlewareConsumer runs on the Fastify
 * adapter as a middie hook, which receives the raw Node request. Guards,
 * interceptors and controllers instead receive the Fastify request wrapper, so
 * anything TenantRequestContextMiddleware assigns lands on `request.raw` and is
 * invisible to everything downstream.
 *
 * Registered as the first global guard, this copies the authenticated request
 * context across before any authorization guard reads it. Global guards run
 * ahead of controller- and route-scoped guards, so the context is always
 * present by the time AuthenticationGuard and friends execute.
 */
const contextKeys = [
  "correlationId",
  "externalPrincipal",
  "principal",
  "workspaceSession",
  "policyAssignments",
] as const;

@Injectable()
export class RawRequestContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;
    const request = context.switchToHttp().getRequest<Record<string, unknown> & { raw?: Record<string, unknown> }>();
    const raw = request?.raw;
    if (!raw || raw === request) return true;

    for (const key of contextKeys) {
      if (request[key] === undefined && raw[key] !== undefined) {
        request[key] = raw[key];
      }
    }
    return true;
  }
}
