import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { StudioHomeWorkspaceComplete } from "../../src/features/studio/studio-complete-workspaces";
import { loadCatalogue } from "../../src/server/catalogue-api";
import {
  loadStudioLibrary,
  loadStudioWorkspace,
} from "../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const resolution = await requireWorkspaceSession();
  if (resolution.demo) {
    return (
      <AppShell session={resolution.session} active="studio">
        <section className="vz-learning-page" aria-labelledby="studio-demo-title">
          <header className="vz-page-heading">
            <div>
              <p>STUDIO</p>
              <h1 id="studio-demo-title">Studio preview</h1>
              <span>
                Studio authoring requires authenticated institutional context. Demo mode shows navigation and layout only.
              </span>
            </div>
          </header>
        </section>
      </AppShell>
    );
  }
  const allowed = [
    "tenant-owner",
    "institution-admin",
    "curriculum-manager",
    "course-manager",
    "instructor",
  ];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [studio, catalogue, library] = await Promise.all([
    loadStudioWorkspace(institutionId),
    loadCatalogue(institutionId),
    loadStudioLibrary(institutionId),
  ]);
  return (
    <AppShell session={resolution.session} active="studio">
      <StudioHomeWorkspaceComplete
        institutionId={institutionId}
        studio={studio}
        catalogue={catalogue}
        library={library}
      />
    </AppShell>
  );
}
