import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { IdentitySessionRepository } from "../infrastructure/identity-session.repository.js";

@Controller("session")
export class PrincipalSessionController {
  constructor(private readonly identities: IdentitySessionRepository) {}

  @Get("principal")
  @UseGuards(AuthenticationGuard, PlatformOperatorGuard)
  principal(@Req() request: AuthenticatedRequest): AuthenticatedPrincipal {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }

  @Get("workspaces")
  @UseGuards(AuthenticationGuard)
  workspaces(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return this.identities.listWorkspaces(request.principal);
  }
}
