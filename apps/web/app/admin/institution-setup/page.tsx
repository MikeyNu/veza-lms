import { notFound } from "next/navigation";
import type { InstitutionId } from "@veza/contracts";
import { AppShell } from "../../../src/components/app-shell";
import { InstitutionSetupCentre } from "../../../src/features/institution-setup/institution-setup-centre";
import { loadScopedInstitution, loadTenantSetupBundle } from "../../../src/server/institution-setup-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function InstitutionSetupPage({ searchParams }: { searchParams: Promise<{ institution?: string }> }) {
  const [resolution, query] = await Promise.all([requireWorkspaceSession(), searchParams]);
  const roles = new Set(resolution.session.membership.roles);
  const tenantOwner = roles.has("tenant-owner");
  const institutionAdmin = roles.has("institution-admin");
  if (!tenantOwner && !institutionAdmin) notFound();

  let bundle;
  if (tenantOwner) {
    const requested = query.institution && uuidPattern.test(query.institution) ? query.institution as InstitutionId : undefined;
    bundle = await loadTenantSetupBundle(requested);
  } else {
    const allowed = resolution.session.membership.institutionIds;
    const selected = query.institution && allowed.includes(query.institution as InstitutionId)
      ? query.institution as InstitutionId
      : allowed[0];
    if (!selected) notFound();
    bundle = await loadScopedInstitution(selected);
  }

  return <AppShell session={resolution.session} active="admin"><InstitutionSetupCentre bundle={bundle} session={resolution.session} tenantOwner={tenantOwner}/></AppShell>;
}
