import type { BaselineRoleKey, TenantModuleKey, WorkspaceSession } from "@veza/contracts";
import type { IconName } from "../../components/icon";

export type NavigationKey =
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

export interface NavigationItem {
  readonly key: NavigationKey;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly badge?: number;
}

interface NavigationDefinition extends Omit<NavigationItem, "label" | "badge"> {
  readonly labels: Partial<Record<BaselineRoleKey, string>> & { readonly default: string };
  readonly roles?: readonly BaselineRoleKey[];
  readonly modules?: readonly TenantModuleKey[];
}

const institutionalRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
];

const definitions: readonly NavigationDefinition[] = [
  { key: "home", labels: { default: "Home", learner: "Today", instructor: "Today", registrar: "Overview", "tenant-owner": "Overview", "institution-admin": "Overview" }, href: "/", icon: "home" },
  { key: "people", labels: { default: "People", instructor: "Learners" }, href: "/people", icon: "people", roles: institutionalRoles },
  { key: "learning", labels: { default: "Learning", learner: "My learning", instructor: "Classes" }, href: "/learning", icon: "book", roles: [...institutionalRoles, "learner"] },
  { key: "studio", labels: { default: "Studio" }, href: "/studio", icon: "studio", roles: ["tenant-owner", "institution-admin", "curriculum-manager", "course-manager", "instructor"], modules: ["studio-pro"] },
  { key: "assess", labels: { default: "Assess", moderator: "Moderation" }, href: "/assessments", icon: "check", roles: ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "assessor", "moderator"] },
  { key: "calendar", labels: { default: "Calendar", registrar: "Timetable" }, href: "/calendar", icon: "calendar", roles: [...institutionalRoles, "assessor", "moderator", "learner", "guardian-sponsor"] },
  { key: "communicate", labels: { default: "Communicate", learner: "Notifications", instructor: "Notifications", "guardian-sponsor": "Notifications" }, href: "/communicate", icon: "message", roles: [...institutionalRoles, "learner", "guardian-sponsor"] },
  { key: "insights", labels: { default: "Insights", learner: "Progress", registrar: "Reports", "guardian-sponsor": "Learner summary" }, href: "/insights", icon: "chart", roles: [...institutionalRoles, "learner", "guardian-sponsor"] },
  { key: "evidence", labels: { default: "Evidence room", auditor: "Evidence room" }, href: "/evidence", icon: "evidence", roles: ["tenant-owner", "institution-admin", "auditor"] },
  { key: "support", labels: { default: "Support cases" }, href: "/support", icon: "support", roles: ["tenant-owner", "institution-admin", "support-agent"] },
  { key: "admin", labels: { default: "Admin" }, href: "/admin/institution-setup", icon: "admin", roles: ["tenant-owner", "institution-admin"] },
  { key: "help", labels: { default: "Help" }, href: "/help", icon: "help" },
];

const rolePriority: readonly BaselineRoleKey[] = [
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

export function primaryRole(session: WorkspaceSession): BaselineRoleKey {
  return rolePriority.find((role) => session.membership.roles.includes(role)) ?? "learner";
}

export function resolveNavigation(session: WorkspaceSession): readonly NavigationItem[] {
  const role = primaryRole(session);
  const modules = new Set(session.entitlements.filter((item) => item.state !== "disabled").map((item) => item.module));
  return definitions
    .filter((item) => !item.roles || item.roles.some((candidate) => session.membership.roles.includes(candidate)))
    .filter((item) => !item.modules || item.modules.every((module) => modules.has(module)))
    .map((item) => ({
      key: item.key,
      label: item.labels[role] ?? item.labels.default,
      href: item.href,
      icon: item.icon,
    }));
}

export function workspaceLabel(session: WorkspaceSession): string {
  const role = primaryRole(session);
  const labels: Partial<Record<BaselineRoleKey, string>> = {
    learner: "Learner workspace",
    instructor: "Teaching workspace",
    registrar: "Registrar workspace",
    "tenant-owner": "Tenant administration",
    "institution-admin": "Institution administration",
    "curriculum-manager": "Curriculum workspace",
    "course-manager": "Course operations",
    assessor: "Assessment workspace",
    moderator: "Moderation workspace",
    "guardian-sponsor": "Guardian workspace",
    auditor: "Evidence workspace",
    "support-agent": "Support workspace",
  };
  return labels[role] ?? "Veza workspace";
}

export function primaryAction(session: WorkspaceSession): Readonly<{ label: string; href: string }> | undefined {
  const roles = new Set(session.membership.roles);
  const modules = new Set(session.entitlements.filter((item) => item.state !== "disabled").map((item) => item.module));
  if (roles.has("tenant-owner")) {
    return { label: "Invite owner", href: "/people/invitations/new" };
  }
  if ((roles.has("instructor") || roles.has("curriculum-manager") || roles.has("course-manager")) && modules.has("studio-pro")) {
    return undefined;
  }
  return undefined;
}
