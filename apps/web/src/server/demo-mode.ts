import "server-only";

import { cookies } from "next/headers";
import type { BaselineRoleKey, WorkspaceSession } from "@veza/contracts";

export const demoRoleCookieName = "veza_demo_role";
export const demoTenantId = "00000000-0000-4000-8000-000000000201";
export const demoInstitutionId = "00000000-0000-4000-8000-000000000401";
export const demoLearnerPersonId = "00000000-0000-4000-8000-000000000101";
export const demoNow = "2026-08-07T10:00:00.000Z";

export const demoRoleOptions: readonly Readonly<{
  key: BaselineRoleKey;
  label: string;
}>[] = [
  { key: "tenant-owner", label: "Tenant owner" },
  { key: "institution-admin", label: "Institution administrator" },
  { key: "registrar", label: "Registrar" },
  { key: "curriculum-manager", label: "Curriculum manager" },
  { key: "course-manager", label: "Course manager" },
  { key: "instructor", label: "Instructor" },
  { key: "assessor", label: "Assessor" },
  { key: "moderator", label: "Moderator" },
  { key: "learner", label: "Learner" },
  { key: "guardian-sponsor", label: "Guardian or sponsor" },
  { key: "auditor", label: "Auditor" },
  { key: "support-agent", label: "Support agent" },
] as const;

const validRoles = new Set<BaselineRoleKey>(demoRoleOptions.map((option) => option.key));

export function demoModeEnabled(): boolean {
  return process.env.VEZA_DEMO_MODE === "true";
}

export function isDemoRole(value: string): value is BaselineRoleKey {
  return validRoles.has(value as BaselineRoleKey);
}

export function demoRoleLabel(role: BaselineRoleKey): string {
  return demoRoleOptions.find((option) => option.key === role)?.label ?? role;
}

function environmentRoles(): readonly BaselineRoleKey[] {
  const requested = process.env.VEZA_DEMO_ROLE
    ?.split(",")
    .map((value) => value.trim())
    .filter(isDemoRole);
  return requested && requested.length > 0 ? requested : ["learner"];
}

export async function resolveDemoRoles(): Promise<readonly BaselineRoleKey[]> {
  if (!demoModeEnabled()) return [];
  const store = await cookies();
  const selected = store.get(demoRoleCookieName)?.value;
  if (selected && isDemoRole(selected)) return [selected];
  return environmentRoles();
}

export async function createDemoWorkspaceSession(): Promise<WorkspaceSession> {
  const roles = await resolveDemoRoles();
  const primaryRole = roles[0] ?? "learner";
  const institutionScoped = roles.some(
    (role) => role !== "learner" && role !== "guardian-sponsor",
  );

  return {
    principal: {
      userId: "00000000-0000-4000-8000-000000000101" as WorkspaceSession["principal"]["userId"],
      displayName: `Demo ${demoRoleLabel(primaryRole)}`,
      email: `${primaryRole.replaceAll("-", ".")}@demo.veza.local`,
    },
    tenant: {
      id: demoTenantId as WorkspaceSession["tenant"]["id"],
      slug: "akha-academy",
      displayName: "Akha Academy",
      status: "active",
      deploymentTier: "shared",
      residencyRegion: "af-south-1",
      planKey: "growth",
      locale: "en-ZA",
      timezone: "Africa/Johannesburg",
    },
    membership: {
      id: "00000000-0000-4000-8000-000000000301" as WorkspaceSession["membership"]["id"],
      status: "active",
      roles: roles as WorkspaceSession["membership"]["roles"],
      institutionIds: institutionScoped
        ? [demoInstitutionId as WorkspaceSession["membership"]["institutionIds"][number]]
        : [],
      locale: "en-ZA",
      timezone: "Africa/Johannesburg",
    },
    entitlements: [
      { module: "core", state: "enabled", limits: {} },
      { module: "studio-pro", state: "enabled", limits: {} },
      { module: "exams", state: "enabled", limits: {} },
      { module: "commerce", state: "enabled", limits: {} },
      { module: "advanced-analytics", state: "enabled", limits: {} },
      { module: "credentials", state: "enabled", limits: {} },
      { module: "guardian-portal", state: "enabled", limits: {} },
      { module: "ai-assist", state: "enabled", limits: {} },
      { module: "integration-hub", state: "enabled", limits: {} },
    ],
  };
}
