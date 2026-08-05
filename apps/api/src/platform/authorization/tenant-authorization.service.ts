import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  evaluateAccess,
  type Permission,
  type PolicyAssignment,
  type ResourceScope,
} from "@veza/authz";
import { canDelegateRole, type DelegationScopeType } from "@veza/authz/delegation";
import type { BaselineRoleKey, TenantModuleKey } from "@veza/contracts";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { TenantContext } from "../request-context/tenant-context.js";

@Injectable()
export class TenantAuthorizationService {
  constructor(private readonly tenantContext: TenantContext) {}

  assertPermission(request: AuthenticatedRequest, permission: Permission, resource?: ResourceScope): void {
    const context = this.tenantContext.require();
    const assignments = request.policyAssignments ?? [];
    const target: ResourceScope = resource ?? {
      type: "tenant",
      id: context.tenantId,
      ancestors: [],
    };
    const enabledModules = (request.workspaceSession?.entitlements ?? [])
      .filter((entitlement) => entitlement.state === "enabled" || entitlement.state === "trial")
      .map((entitlement) => entitlement.module);
    const decision = evaluateAccess(assignments, permission, target, {
      now: new Date().toISOString(),
      authenticationMethods: context.authenticationMethods,
      enabledModules,
    });
    if (!decision.allowed) throw new ForbiddenException(`Permission denied: ${decision.reason}`);
  }

  assertCanDelegate(
    request: AuthenticatedRequest,
    targetRole: BaselineRoleKey,
    resource: ResourceScope,
  ): void {
    if (resource.type !== "tenant" && resource.type !== "institution") {
      throw new ForbiddenException("Role delegation is not available for this scope yet");
    }
    const actingRoles = request.workspaceSession?.membership.roles ?? [];
    if (!canDelegateRole(actingRoles, targetRole, resource.type as DelegationScopeType)) {
      throw new ForbiddenException("The selected role cannot be delegated from this workspace scope");
    }
  }

  buildTenantResource(): ResourceScope {
    const context = this.tenantContext.require();
    return { type: "tenant", id: context.tenantId, ancestors: [] };
  }

  buildInstitutionResource(institutionId: string): ResourceScope {
    const context = this.tenantContext.require();
    return {
      type: "institution",
      id: institutionId,
      ancestors: [{ type: "tenant", id: context.tenantId }],
    };
  }
}

export type { Permission, PolicyAssignment, TenantModuleKey };
