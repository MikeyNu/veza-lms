import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { MembershipId } from "@veza/contracts";
import type { AuthenticatedRequest } from "../../platform/authentication/authenticated-request.js";
import { PrincipalVerifier } from "../../platform/authentication/principal-verifier.service.js";
import { TenantContext } from "../../platform/request-context/tenant-context.js";
import { IdentitySessionRepository } from "../identity-access/infrastructure/identity-session.repository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const correlationPattern = /^[A-Za-z0-9._:-]{8,128}$/;

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

function headerValue(request: AuthenticatedRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class TenantRequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly principalVerifier: PrincipalVerifier,
    private readonly identities: IdentitySessionRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async use(
    request: AuthenticatedRequest,
    response: HeaderResponse,
    next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      const suppliedCorrelationId = headerValue(request, "x-correlation-id");
      const correlationId = suppliedCorrelationId && correlationPattern.test(suppliedCorrelationId)
        ? suppliedCorrelationId
        : randomUUID();
      request.correlationId = correlationId;
      response.setHeader("x-correlation-id", correlationId);

      const external = await this.principalVerifier.verifyAuthorizationHeader(headerValue(request, "authorization"));
      if (!external) {
        next();
        return;
      }
      request.externalPrincipal = external;

      const principal = await this.identities.findPrincipal(external);
      if (!principal) {
        next();
        return;
      }
      request.principal = principal;

      const membershipValue = headerValue(request, "x-veza-membership-id");
      if (!membershipValue) {
        next();
        return;
      }
      if (!uuidPattern.test(membershipValue)) throw new BadRequestException("Invalid membership selector");

      const resolved = await this.identities.resolveWorkspace(principal, membershipValue as MembershipId);
      request.workspaceSession = resolved.workspace;
      request.policyAssignments = resolved.policyAssignments;
      this.tenantContext.run(
        {
          tenantId: resolved.workspace.tenant.id,
          actorId: principal.userId,
          membershipId: resolved.workspace.membership.id,
          correlationId,
          locale: resolved.workspace.membership.locale,
          timezone: resolved.workspace.membership.timezone,
          authenticationMethods: principal.authenticationMethods,
        },
        next,
      );
    } catch (error) {
      next(error);
    }
  }
}
