import type { BaselineRoleKey, ScopeType } from "@veza/contracts";

export type DelegationScopeType = Extract<ScopeType, "tenant" | "institution">;

const tenantRoles: readonly BaselineRoleKey[] = ["tenant-owner", "auditor"];
const institutionRoles: readonly BaselineRoleKey[] = [
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
  "auditor",
];
const institutionAdministratorRoles: readonly BaselineRoleKey[] = [
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
  "auditor",
];
const registrarRoles: readonly BaselineRoleKey[] = ["learner", "guardian-sponsor"];

export function canDelegateRole(
  actingRoles: readonly BaselineRoleKey[],
  targetRole: BaselineRoleKey,
  scopeType: DelegationScopeType,
): boolean {
  const acting = new Set(actingRoles);
  if (acting.has("tenant-owner")) {
    return scopeType === "tenant" ? tenantRoles.includes(targetRole) : institutionRoles.includes(targetRole);
  }
  if (acting.has("institution-admin") && scopeType === "institution") {
    return institutionAdministratorRoles.includes(targetRole);
  }
  if (acting.has("registrar") && scopeType === "institution") {
    return registrarRoles.includes(targetRole);
  }
  return false;
}

export function delegableRolesFor(
  actingRoles: readonly BaselineRoleKey[],
  scopeType: DelegationScopeType,
): readonly BaselineRoleKey[] {
  const candidates = scopeType === "tenant" ? tenantRoles : institutionRoles;
  return candidates.filter((role) => canDelegateRole(actingRoles, role, scopeType));
}
