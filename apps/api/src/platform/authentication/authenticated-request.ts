import type { IncomingMessage } from "node:http";
import type { PolicyAssignment } from "@veza/authz";
import type { AuthenticatedPrincipal, WorkspaceSession } from "@veza/contracts";
import type { ExternalPrincipal } from "./external-principal.js";

export interface AuthenticatedRequest extends IncomingMessage {
  externalPrincipal?: ExternalPrincipal;
  principal?: AuthenticatedPrincipal;
  workspaceSession?: WorkspaceSession;
  policyAssignments?: readonly PolicyAssignment[];
  correlationId?: string;
}
