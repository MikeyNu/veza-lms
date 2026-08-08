import type { BaselineRoleKey, WorkspaceSession } from "@veza/contracts";
import type { Route } from "next";
import type { IconName } from "../../components/icon";
import {
  canAccessNavigation,
  type WorkspaceNavigationKey,
} from "./access-policy";

export type NavigationKey = WorkspaceNavigationKey;

export interface NavigationItem {
  readonly key: NavigationKey;
  readonly label: string;
  readonly href: Route;
  readonly icon: IconName;
  readonly badge?: number;
}

interface NavigationDefinition extends Omit<NavigationItem, "label" | "badge"> {
  readonly labels: Partial<Record<BaselineRoleKey, string>> & { readonly default: string };
}

const definitions: readonly NavigationDefinition[] = [
  { key: "home", labels: { default: "Home", learner: "Today", instructor: "Today", registrar: "Overview", "tenant-owner": "Overview", "institution-admin": "Overview", "curriculum-manager": "Overview", "course-manager": "Overview" }, href: "/", icon: "home" },
  { key: "people", labels: { default: "People", instructor: "Learners" }, href: "/people", icon: "people" },
  { key: "learning", labels: { default: "Learning", learner: "My learning", instructor: "Classes" }, href: "/learning", icon: "book" },
  { key: "studio", labels: { default: "Studio" }, href: "/studio", icon: "studio" },
  { key: "assess", labels: { default: "Assess", moderator: "Moderation" }, href: "/assessments", icon: "check" },
  { key: "calendar", labels: { default: "Calendar", registrar: "Timetable" }, href: "/calendar", icon: "calendar" },
  { key: "communicate", labels: { default: "Communicate", learner: "Notifications", instructor: "Notifications", "guardian-sponsor": "Notifications" }, href: "/communicate", icon: "message" },
  { key: "insights", labels: { default: "Insights", learner: "Progress", registrar: "Reports", "guardian-sponsor": "Learner summary", auditor: "Analytics evidence" }, href: "/insights", icon: "chart" },
  { key: "evidence", labels: { default: "Evidence room", auditor: "Evidence room" }, href: "/evidence", icon: "evidence" },
  { key: "support", labels: { default: "Support cases", "support-agent": "Support cases" }, href: "/support", icon: "support" },
  { key: "admin", labels: { default: "Admin" }, href: "/admin/institution-setup", icon: "admin" },
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
  return definitions
    .filter((item) => canAccessNavigation(session, item.key))
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

export function primaryAction(session: WorkspaceSession): Readonly<{ label: string; href: Route }> | undefined {
  const roles = new Set(session.membership.roles);
  if (roles.has("tenant-owner")) {
    return { label: "Invite owner", href: "/people/invitations/new" };
  }
  return undefined;
}
