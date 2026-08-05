import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { StudioHomeWorkspace } from "../../src/features/studio/studio-workspaces";
import { loadCatalogue } from "../../src/server/catalogue-api";
import { loadStudioWorkspace } from "../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const resolution = await requireWorkspaceSession();
  const allowed = ["tenant-owner", "institution-admin", "curriculum-manager", "course-manager", "instructor"];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [studio, catalogue] = await Promise.all([loadStudioWorkspace(institutionId), loadCatalogue(institutionId)]);
  return <AppShell session={resolution.session} active="studio"><StudioHomeWorkspace institutionId={institutionId} studio={studio} catalogue={catalogue} /></AppShell>;
}
