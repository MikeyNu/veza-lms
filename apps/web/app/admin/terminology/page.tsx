import { notFound } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { TerminologyWorkspace } from "../../../src/features/terminology/terminology-workspace";
import {
  loadResolvedTerminology,
  loadTerminologyVersions,
} from "../../../src/server/terminology-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
const allowedRoles = new Set([
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
]);
const managingRoles = new Set(["tenant-owner", "institution-admin"]);

export default async function TerminologyPage() {
  const resolution = await requireWorkspaceSession();
  const roles = resolution.session.membership.roles;
  if (!roles.some((role) => allowedRoles.has(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const [versions, resolved] = await Promise.all([
    loadTerminologyVersions(institutionId),
    loadResolvedTerminology(institutionId, resolution.session.membership.locale),
  ]);
  return (
    <AppShell session={resolution.session} active="admin">
      <TerminologyWorkspace
        institutionId={institutionId}
        versions={versions}
        resolved={resolved}
        canManage={roles.some((role) => managingRoles.has(role))}
        canApprove={roles.some((role) => managingRoles.has(role))}
      />
    </AppShell>
  );
}
