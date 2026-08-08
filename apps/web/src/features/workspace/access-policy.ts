import type { BaselineRoleKey, TenantModuleKey, WorkspaceSession } from "@veza/contracts";
import type { Route } from "next";

export type WorkspaceNavigationKey =
  | "home"
  | "people"
  | "learning"
  | "studio"
  | "assess"
  | "calendar"
  | "communicate"
  | "insights"
  | "evidence"
  | "support"
  | "admin"
  | "help";

export interface WorkspaceRoutePolicy {
  readonly id: string;
  readonly pattern: RegExp;
  readonly roles?: readonly BaselineRoleKey[];
  readonly modules?: readonly TenantModuleKey[];
}

export const allWorkspaceRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
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
  "support-agent",
] as const;

export const institutionalHomeRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
] as const;

export const peopleRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "course-manager",
  "instructor",
] as const;

export const learningRoles: readonly BaselineRoleKey[] = [
  ...institutionalHomeRoles,
  "learner",
] as const;

export const studioRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "curriculum-manager",
  "course-manager",
  "instructor",
] as const;

export const assessmentRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
] as const;

export const calendarRoles: readonly BaselineRoleKey[] = [
  ...institutionalHomeRoles,
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
] as const;

export const communicationRoles: readonly BaselineRoleKey[] = [
  ...institutionalHomeRoles,
  "learner",
  "guardian-sponsor",
] as const;

export const insightRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "course-manager",
  "instructor",
  "learner",
  "guardian-sponsor",
  "auditor",
] as const;

export const evidenceRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "auditor",
] as const;

export const supportCaseRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "support-agent",
] as const;

export const administrationRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
] as const;

export const reconciliationRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
] as const;

export const internalDesignSystemRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "support-agent",
] as const;

export const navigationAccess: Readonly<Record<WorkspaceNavigationKey, Readonly<{
  roles: readonly BaselineRoleKey[];
  modules?: readonly TenantModuleKey[];
}>>> = {
  home: { roles: [...institutionalHomeRoles, "learner"] },
  people: { roles: peopleRoles },
  learning: { roles: learningRoles },
  studio: { roles: studioRoles, modules: ["studio-pro"] },
  assess: { roles: assessmentRoles },
  calendar: { roles: calendarRoles },
  communicate: { roles: communicationRoles },
  insights: { roles: insightRoles },
  evidence: { roles: evidenceRoles },
  support: { roles: supportCaseRoles },
  admin: { roles: administrationRoles },
  help: { roles: allWorkspaceRoles },
};

const routePolicies: readonly WorkspaceRoutePolicy[] = [
  { id: "today", pattern: /^\/today\/?$/, roles: ["learner"] },
  { id: "course-room", pattern: /^\/courses\/[^/]+\/?$/, roles: ["learner"] },
  { id: "studio-lesson", pattern: /^\/studio\/lessons\/[^/]+\/?$/, roles: studioRoles, modules: ["studio-pro"] },
  { id: "studio", pattern: /^\/studio(?:\/.*)?$/, roles: studioRoles, modules: ["studio-pro"] },
  { id: "gradebook", pattern: /^\/gradebook\/[^/]+\/?$/, roles: assessmentRoles },
  { id: "assessments", pattern: /^\/assessments(?:\/.*)?$/, roles: assessmentRoles },
  { id: "evidence-exports", pattern: /^\/evidence\/exports(?:\/.*)?$/, roles: reconciliationRoles },
  { id: "evidence", pattern: /^\/evidence(?:\/.*)?$/, roles: evidenceRoles },
  { id: "people-duplicates", pattern: /^\/people\/duplicates\/?$/, roles: reconciliationRoles },
  { id: "people-invitations", pattern: /^\/people\/invitations(?:\/.*)?$/, roles: reconciliationRoles },
  { id: "people", pattern: /^\/people(?:\/.*)?$/, roles: peopleRoles },
  { id: "service-accounts", pattern: /^\/admin\/service-accounts(?:\/.*)?$/, roles: ["tenant-owner"] },
  { id: "administration", pattern: /^\/admin(?:\/.*)?$/, roles: administrationRoles },
  { id: "learning", pattern: /^\/learning(?:\/.*)?$/, roles: learningRoles },
  { id: "calendar", pattern: /^\/calendar(?:\/.*)?$/, roles: calendarRoles },
  { id: "communications", pattern: /^\/communicate(?:\/.*)?$/, roles: communicationRoles },
  { id: "insights", pattern: /^\/insights(?:\/.*)?$/, roles: insightRoles },
  { id: "support", pattern: /^\/support(?:\/.*)?$/, roles: supportCaseRoles },
  { id: "design-system", pattern: /^\/design-system(?:\/.*)?$/, roles: internalDesignSystemRoles },
  { id: "profile", pattern: /^\/profile(?:\/.*)?$/, roles: allWorkspaceRoles },
  { id: "help", pattern: /^\/help(?:\/.*)?$/, roles: allWorkspaceRoles },
  { id: "home", pattern: /^\/$/, roles: [...institutionalHomeRoles, "learner"] },
] as const;

function enabledModules(session: WorkspaceSession): ReadonlySet<TenantModuleKey> {
  return new Set(
    session.entitlements
      .filter((entitlement) => entitlement.state !== "disabled")
      .map((entitlement) => entitlement.module),
  );
}

function rolesIntersect(sessionRoles: readonly BaselineRoleKey[], allowedRoles: readonly BaselineRoleKey[]): boolean {
  const allowed = new Set(allowedRoles);
  return sessionRoles.some((role) => allowed.has(role));
}

export function canAccessNavigation(session: WorkspaceSession, key: WorkspaceNavigationKey): boolean {
  const policy = navigationAccess[key];
  if (!rolesIntersect(session.membership.roles, policy.roles)) return false;
  if (!policy.modules) return true;
  const modules = enabledModules(session);
  return policy.modules.every((module) => modules.has(module));
}

export function routePolicyForPath(pathname: string): WorkspaceRoutePolicy | undefined {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  return routePolicies.find((policy) => policy.pattern.test(path));
}

export function canAccessPathForRoles(
  roles: readonly BaselineRoleKey[],
  pathname: string,
  modules: readonly TenantModuleKey[] = [],
): boolean {
  const policy = routePolicyForPath(pathname);
  if (!policy) return true;
  if (policy.roles && !roles.some((role) => policy.roles?.includes(role))) return false;
  if (policy.modules && !policy.modules.every((module) => modules.includes(module))) return false;
  return true;
}

export function canAccessWorkspacePath(session: WorkspaceSession, pathname: string): boolean {
  return canAccessPathForRoles(
    session.membership.roles,
    pathname,
    [...enabledModules(session)],
  );
}

export function canonicalLandingPath(role: BaselineRoleKey): Route {
  switch (role) {
    case "support-agent":
      return "/support";
    case "auditor":
      return "/evidence";
    case "guardian-sponsor":
      return "/insights";
    case "assessor":
    case "moderator":
      return "/assessments";
    default:
      return "/";
  }
}

export function canonicalLandingPathForRoles(roles: readonly BaselineRoleKey[]): Route {
  const priority: readonly BaselineRoleKey[] = [
    "tenant-owner",
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
    "support-agent",
  ];
  const role = priority.find((candidate) => roles.includes(candidate)) ?? "learner";
  return canonicalLandingPath(role);
}

export function roleModulesForDemo(): readonly TenantModuleKey[] {
  return [
    "core",
    "studio-pro",
    "exams",
    "commerce",
    "advanced-analytics",
    "credentials",
    "guardian-portal",
    "ai-assist",
    "integration-hub",
  ];
}
