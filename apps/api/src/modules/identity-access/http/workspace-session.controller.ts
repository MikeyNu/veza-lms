import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { WorkspaceSession } from "@veza/contracts";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";

@Controller("session")
@UseGuards(AuthenticationGuard, TenantMembershipGuard)
export class WorkspaceSessionController {
  @Get("workspace")
  getWorkspace(@Req() request: AuthenticatedRequest): WorkspaceSession {
    if (!request.workspaceSession) throw new Error("Workspace session was not resolved");
    return request.workspaceSession;
  }
}
