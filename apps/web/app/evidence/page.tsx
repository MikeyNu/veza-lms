import { notFound } from "next/navigation";
import type { BaselineRoleKey } from "@veza/contracts";
import { AppShell } from "../../src/components/app-shell";
import { CredentialGovernanceCompletion } from "../../src/features/academic-evidence/academic-governance-completion";
import { EvidenceWorkspace } from "../../src/features/academic-evidence/academic-workspaces";
import { EvidenceRoom } from "../../src/features/evidence/evidence-room";
import { loadAcademicEvidenceWorkspace } from "../../src/server/academic-evidence-api";
import { loadAuditEvents, type AuditFilters } from "../../src/server/audit-api";
import { loadCatalogue, loadCatalogueReferences } from "../../src/server/catalogue-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
const evidenceRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "auditor",
];
type Query = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function filters(query: Query): AuditFilters {
  const eventType = single(query.eventType);
  const resourceType = single(query.resourceType);
  const resourceId = single(query.resourceId);
  const actorId = single(query.actorId);
  const from = single(query.from);
  const to = single(query.to);
  const cursor = single(query.cursor);
  return {
    ...(eventType ? { eventType } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 30,
  };
}

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const [resolution, query] = await Promise.all([
    requireWorkspaceSession(),
    searchParams,
  ]);
  const roles = new Set(resolution.session.membership.roles);
  if (!evidenceRoles.some((role) => roles.has(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const selectedFilters = filters(query);
  const [auditPage, workspace, catalogue, references] = await Promise.all([
    loadAuditEvents(selectedFilters),
    loadAcademicEvidenceWorkspace(institutionId),
    loadCatalogue(institutionId),
    loadCatalogueReferences(institutionId),
  ]);
  return (
    <AppShell session={resolution.session} active="evidence">
      <EvidenceWorkspace
        institutionId={institutionId}
        workspace={workspace}
        catalogue={catalogue}
        references={references}
      />
      <CredentialGovernanceCompletion
        institutionId={institutionId}
        workspace={workspace}
        references={references}
        canApprove={roles.has("tenant-owner") || roles.has("institution-admin")}
      />
      <EvidenceRoom page={auditPage} filters={selectedFilters} session={resolution.session} />
    </AppShell>
  );
}
