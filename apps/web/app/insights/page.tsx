import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { AnalyticsWorkspace } from "../../src/features/academic-evidence/academic-workspaces";
import { loadInstitutionAnalytics } from "../../src/server/academic-evidence-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const resolution = await requireWorkspaceSession();
  const allowed = ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor", "auditor"];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const metrics = await loadInstitutionAnalytics(institutionId);
  return <AppShell session={resolution.session} active="insights"><AnalyticsWorkspace metrics={metrics} /></AppShell>;
}
