import type { PolicyAssignment } from "@veza/authz";
import type { AuthenticatedPrincipal, WorkspaceSession } from "@veza/contracts";
import type { ExternalPrincipal } from "../../../platform/authentication/external-principal.js";

export interface ResolvedWorkspaceSession {
  readonly principal: AuthenticatedPrincipal;
  readonly workspace: WorkspaceSession;
  readonly policyAssignments: readonly PolicyAssignment[];
}

export interface PrincipalLookup {
  findPrincipal(external: ExternalPrincipal, correlationId: string): Promise<AuthenticatedPrincipal | undefined>;
}
