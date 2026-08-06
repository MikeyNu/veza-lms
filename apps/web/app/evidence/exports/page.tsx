import { notFound } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { GovernedExportWorkspace } from "../../../src/features/academic-evidence/governed-export-workspace";
import { loadAcademicEvidenceWorkspace } from "../../../src/server/academic-evidence-api";
import { loadCatalogue, loadCatalogueReferences } from "../../../src/server/catalogue-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const exportManagerRoles = new Set(["tenant-owner", "institution-admin", "registrar"]);

export default async function GovernedExportsPage() {
  const resolution = await requireWorkspaceSession();
  if (!resolution.session.membership.roles.some((role) => exportManagerRoles.has(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [workspace, catalogue, references] = await Promise.all([
    loadAcademicEvidenceWorkspace(institutionId),
    loadCatalogue(institutionId),
    loadCatalogueReferences(institutionId),
  ]);

  return (
    <AppShell session={resolution.session} active="evidence">
      <GovernedExportWorkspace
        institutionId={institutionId}
        workspace={workspace}
        catalogue={catalogue}
        references={references}
      />
    </AppShell>
  );
}
