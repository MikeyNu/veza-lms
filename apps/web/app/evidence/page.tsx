import { notFound } from "next/navigation";
import type { BaselineRoleKey } from "@veza/contracts";
import { AppShell } from "../../src/components/app-shell";
import { EvidenceRoom } from "../../src/features/evidence/evidence-room";
import { loadAuditEvents, type AuditFilters } from "../../src/server/audit-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const evidenceRoles: readonly BaselineRoleKey[] = ["tenant-owner", "institution-admin", "auditor"];
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

export default async function EvidencePage({ searchParams }: { searchParams: Promise<Query> }) {
  const [resolution, query] = await Promise.all([requireWorkspaceSession(), searchParams]);
  const roles = new Set(resolution.session.membership.roles);
  if (!evidenceRoles.some((role) => roles.has(role))) notFound();
  const selectedFilters = filters(query);
  const page = await loadAuditEvents(selectedFilters);
  return <AppShell session={resolution.session} active="evidence"><EvidenceRoom page={page} filters={selectedFilters} session={resolution.session}/></AppShell>;
}
