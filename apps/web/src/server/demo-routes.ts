import "server-only";

import type { BaselineRoleKey } from "@veza/contracts";
import {
  administrationRoles,
  allWorkspaceRoles,
  assessmentRoles,
  calendarRoles,
  communicationRoles,
  evidenceRoles,
  insightRoles,
  institutionalHomeRoles,
  internalDesignSystemRoles,
  peopleRoles,
  reconciliationRoles,
  studioRoles,
  supportCaseRoles,
} from "../features/workspace/access-policy";
import { demoFixtureIds } from "./demo-workspace-data";

export interface DemoRouteDefinition {
  readonly group: "Learner" | "Academic staff" | "Administration" | "Account and support";
  readonly label: string;
  readonly href: string;
  readonly roles: readonly BaselineRoleKey[];
  readonly note: string;
}

export const demoRoutes: readonly DemoRouteDefinition[] = [
  { group: "Learner", label: "Today", href: "/today", roles: ["learner"], note: "Priorities, upcoming work and learner home state" },
  { group: "Learner", label: "My learning", href: "/learning", roles: ["learner", ...institutionalHomeRoles], note: "Learner course view or staff curriculum workspace by role" },
  { group: "Learner", label: "Course room", href: `/courses/${demoFixtureIds.enrolmentId}`, roles: ["learner"], note: "Published course content, progress and discussion context" },
  { group: "Learner", label: "Learner progress", href: "/insights", roles: insightRoles, note: "Learner, guardian and institutional analytics states vary by role" },
  { group: "Academic staff", label: "Learning administration", href: "/learning", roles: institutionalHomeRoles, note: "Curriculum governance, course runs and delivery structure" },
  { group: "Academic staff", label: "Studio", href: "/studio", roles: studioRoles, note: "Course spaces, modules, lessons, library and publications" },
  { group: "Academic staff", label: "Studio lesson", href: `/studio/lessons/${demoFixtureIds.lessonId}`, roles: studioRoles, note: "Lesson revision, review and publication evidence" },
  { group: "Academic staff", label: "Assessments", href: "/assessments", roles: assessmentRoles, note: "Assignments, submissions and gradebook governance" },
  { group: "Academic staff", label: "Gradebook", href: `/gradebook/${demoFixtureIds.courseRunId}`, roles: assessmentRoles, note: "Course-run gradebook detail" },
  { group: "Academic staff", label: "Evidence", href: "/evidence", roles: evidenceRoles, note: "Credentials, exports and audit trail" },
  { group: "Academic staff", label: "Governed exports", href: "/evidence/exports", roles: reconciliationRoles, note: "Evidence export jobs and receipts" },
  { group: "Academic staff", label: "Communications", href: "/communicate", roles: communicationRoles, note: "Administrative or recipient communications state by role" },
  { group: "Academic staff", label: "Calendar", href: "/calendar", roles: calendarRoles, note: "Schedule and academic calendar surface" },
  { group: "Administration", label: "People", href: "/people", roles: peopleRoles, note: "Canonical people directory and bulk operations" },
  { group: "Administration", label: "Person record", href: `/people/${demoFixtureIds.demoLearnerPersonId}`, roles: peopleRoles, note: "Learner identity, relationships, consent and institutional profile" },
  { group: "Administration", label: "Duplicate review", href: "/people/duplicates", roles: reconciliationRoles, note: "Duplicate candidate review and merge controls" },
  { group: "Administration", label: "New invitation", href: "/people/invitations/new", roles: reconciliationRoles, note: "Identity invitation workflow" },
  { group: "Administration", label: "Access administration", href: "/admin/access", roles: administrationRoles, note: "Memberships, role assignments and invitations" },
  { group: "Administration", label: "Institution setup", href: "/admin/institution-setup", roles: administrationRoles, note: "Structure, campuses, academic periods, policies and readiness" },
  { group: "Administration", label: "Storage administration", href: "/admin/storage", roles: administrationRoles, note: "Storage quota, assets, processing and deletion governance" },
  { group: "Administration", label: "Terminology", href: "/admin/terminology", roles: administrationRoles, note: "Institution labels and programme hierarchy" },
  { group: "Administration", label: "Service accounts", href: "/admin/service-accounts", roles: ["tenant-owner"], note: "Integration principals, scopes and secret lifecycle" },
  { group: "Account and support", label: "Profile", href: "/profile", roles: allWorkspaceRoles, note: "Account, preferences and recipient communications settings" },
  { group: "Account and support", label: "Support cases", href: "/support", roles: supportCaseRoles, note: "Time-bounded support case workspace" },
  { group: "Account and support", label: "Help", href: "/help", roles: allWorkspaceRoles, note: "Help and policy guidance" },
  { group: "Account and support", label: "Design system", href: "/design-system", roles: internalDesignSystemRoles, note: "Internal component and token review surface" },
] as const;
