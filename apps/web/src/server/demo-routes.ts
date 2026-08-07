import "server-only";

import type { BaselineRoleKey } from "@veza/contracts";
import { demoFixtureIds } from "./demo-workspace-data";

export interface DemoRouteDefinition {
  readonly group: "Learner" | "Academic staff" | "Administration" | "Account and support";
  readonly label: string;
  readonly href: string;
  readonly roles: readonly BaselineRoleKey[];
  readonly note: string;
}

const allStaff: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
];

export const demoRoutes: readonly DemoRouteDefinition[] = [
  {
    group: "Learner",
    label: "Today",
    href: "/today",
    roles: ["learner"],
    note: "Priorities, upcoming work and learner home state",
  },
  {
    group: "Learner",
    label: "My learning",
    href: "/learning",
    roles: ["learner", ...allStaff],
    note: "Learner course view or staff curriculum workspace by role",
  },
  {
    group: "Learner",
    label: "Course room",
    href: `/courses/${demoFixtureIds.enrolmentId}`,
    roles: ["learner"],
    note: "Published course content, progress and discussion context",
  },
  {
    group: "Learner",
    label: "Learner progress",
    href: "/insights",
    roles: ["learner", "guardian-sponsor", "tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "auditor"],
    note: "Learner, guardian and institutional analytics states vary by role",
  },
  {
    group: "Academic staff",
    label: "Learning administration",
    href: "/learning",
    roles: allStaff,
    note: "Curriculum governance, course runs and delivery structure",
  },
  {
    group: "Academic staff",
    label: "Studio",
    href: "/studio",
    roles: ["tenant-owner", "institution-admin", "curriculum-manager", "course-manager", "instructor"],
    note: "Course spaces, modules, lessons, library and publications",
  },
  {
    group: "Academic staff",
    label: "Studio lesson",
    href: `/studio/lessons/${demoFixtureIds.lessonId}`,
    roles: ["tenant-owner", "institution-admin", "curriculum-manager", "course-manager", "instructor"],
    note: "Lesson revision, review and publication evidence",
  },
  {
    group: "Academic staff",
    label: "Assessments",
    href: "/assessments",
    roles: ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "assessor", "moderator"],
    note: "Assignments, submissions and gradebook governance",
  },
  {
    group: "Academic staff",
    label: "Gradebook",
    href: `/gradebook/${demoFixtureIds.courseRunId}`,
    roles: ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "assessor", "moderator"],
    note: "Course-run gradebook detail",
  },
  {
    group: "Academic staff",
    label: "Evidence",
    href: "/evidence",
    roles: ["tenant-owner", "institution-admin", "registrar", "auditor"],
    note: "Credentials, exports and audit trail",
  },
  {
    group: "Academic staff",
    label: "Governed exports",
    href: "/evidence/exports",
    roles: ["tenant-owner", "institution-admin", "registrar"],
    note: "Evidence export jobs and receipts",
  },
  {
    group: "Academic staff",
    label: "Communications",
    href: "/communicate",
    roles: ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "learner", "guardian-sponsor"],
    note: "Administrative or recipient communications state by role",
  },
  {
    group: "Academic staff",
    label: "Calendar",
    href: "/calendar",
    roles: ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "learner"],
    note: "Schedule and academic calendar surface",
  },
  {
    group: "Administration",
    label: "People",
    href: "/people",
    roles: ["tenant-owner", "institution-admin", "registrar", "support-agent"],
    note: "Canonical people directory and bulk operations",
  },
  {
    group: "Administration",
    label: "Person record",
    href: `/people/${demoFixtureIds.demoLearnerPersonId}`,
    roles: ["tenant-owner", "institution-admin", "registrar", "support-agent"],
    note: "Learner identity, relationships, consent and institutional profile",
  },
  {
    group: "Administration",
    label: "Duplicate review",
    href: "/people/duplicates",
    roles: ["tenant-owner", "institution-admin", "registrar"],
    note: "Duplicate candidate review and merge controls",
  },
  {
    group: "Administration",
    label: "New invitation",
    href: "/people/invitations/new",
    roles: ["tenant-owner", "institution-admin", "registrar"],
    note: "Identity invitation workflow",
  },
  {
    group: "Administration",
    label: "Access administration",
    href: "/admin/access",
    roles: ["tenant-owner", "institution-admin"],
    note: "Memberships, role assignments and invitations",
  },
  {
    group: "Administration",
    label: "Institution setup",
    href: "/admin/institution-setup",
    roles: ["tenant-owner", "institution-admin"],
    note: "Structure, campuses, academic periods, policies and readiness",
  },
  {
    group: "Administration",
    label: "Storage administration",
    href: "/admin/storage",
    roles: ["tenant-owner", "institution-admin"],
    note: "Storage quota, assets, processing and deletion governance",
  },
  {
    group: "Administration",
    label: "Terminology",
    href: "/admin/terminology",
    roles: ["tenant-owner", "institution-admin"],
    note: "Institution labels and programme hierarchy",
  },
  {
    group: "Administration",
    label: "Service accounts",
    href: "/admin/service-accounts",
    roles: ["tenant-owner"],
    note: "Integration principals, scopes and secret lifecycle",
  },
  {
    group: "Account and support",
    label: "Profile",
    href: "/profile",
    roles: ["tenant-owner", "institution-admin", "registrar", "curriculum-manager", "course-manager", "instructor", "assessor", "moderator", "learner", "guardian-sponsor", "auditor", "support-agent"],
    note: "Account, preferences and recipient communications settings",
  },
  {
    group: "Account and support",
    label: "Support",
    href: "/support",
    roles: ["tenant-owner", "institution-admin", "registrar", "curriculum-manager", "course-manager", "instructor", "assessor", "moderator", "learner", "guardian-sponsor", "auditor", "support-agent"],
    note: "Support workspace",
  },
  {
    group: "Account and support",
    label: "Help",
    href: "/help",
    roles: ["tenant-owner", "institution-admin", "registrar", "curriculum-manager", "course-manager", "instructor", "assessor", "moderator", "learner", "guardian-sponsor", "auditor", "support-agent"],
    note: "Help and policy guidance",
  },
  {
    group: "Account and support",
    label: "Design system",
    href: "/design-system",
    roles: ["tenant-owner", "institution-admin", "support-agent"],
    note: "Internal component and token review surface",
  },
] as const;
