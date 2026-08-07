import { cookies } from "next/headers";
import type { WorkspaceSession } from "@veza/contracts";
import { membershipCookieName } from "./auth-config";
import { createDemoWorkspaceSession, demoModeEnabled } from "./demo-mode";
import { getWebOidcSession } from "./web-session";
import { listWorkspaceOptions, loadWorkspaceSession, WorkspaceApiError } from "./workspace-api";

export const demoLearnerSession: WorkspaceSession = {
  principal: {
    userId: "00000000-0000-4000-8000-000000000101" as WorkspaceSession["principal"]["userId"],
    displayName: "Demo Learner",
    email: "learner@example.com",
  },
  tenant: {
    id: "00000000-0000-4000-8000-000000000201" as WorkspaceSession["tenant"]["id"],
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
    roles: ["learner"],
    institutionIds: [],
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
  },
  entitlements: [
    { module: "core", state: "enabled", limits: {} },
    { module: "studio-pro", state: "enabled", limits: {} },
  ],
};

export type WorkspaceResolution =
  | { readonly status: "ready"; readonly session: WorkspaceSession; readonly demo: boolean }
  | { readonly status: "signed-out" }
  | { readonly status: "select-workspace" }
  | { readonly status: "access-pending" };

export async function resolveWorkspaceSession(): Promise<WorkspaceResolution> {
  if (demoModeEnabled()) {
    return { status: "ready", session: await createDemoWorkspaceSession(), demo: true };
  }

  const [cookieStore, oidcSession] = await Promise.all([cookies(), getWebOidcSession()]);
  if (!oidcSession) {
    return { status: "signed-out" };
  }

  const membershipId = cookieStore.get(membershipCookieName)?.value;
  if (!membershipId) {
    const workspaces = await listWorkspaceOptions(oidcSession.accessToken);
    return workspaces.length === 0 ? { status: "access-pending" } : { status: "select-workspace" };
  }

  try {
    return { status: "ready", session: await loadWorkspaceSession(oidcSession.accessToken, membershipId), demo: false };
  } catch (error) {
    if (error instanceof WorkspaceApiError && error.status === 401) return { status: "signed-out" };
    if (error instanceof WorkspaceApiError && (error.status === 400 || error.status === 403)) {
      const workspaces = await listWorkspaceOptions(oidcSession.accessToken);
      return workspaces.length === 0 ? { status: "access-pending" } : { status: "select-workspace" };
    }
    throw error;
  }
}
