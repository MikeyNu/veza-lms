import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { PlatformAudit } from "../../src/features/audit/platform-audit";
import { loadPlatformAudit, type PlatformAuditFilters } from "../../src/server/platform-audit-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";
type Query = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [session, query] = await Promise.all([requireOperatorSession(), searchParams]);
  const eventType = single(query.eventType);
  const actorId = single(query.actorId);
  const resourceType = single(query.resourceType);
  const resourceId = single(query.resourceId);
  const from = single(query.from);
  const to = single(query.to);
  const cursor = single(query.cursor);
  const filters: PlatformAuditFilters = {
    ...(eventType ? { eventType } : {}),
    ...(actorId ? { actorId } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(resourceId ? { resourceId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 50,
  };
  const page = await loadPlatformAudit(session.oidc.accessToken, filters);
  return <ControlPlaneShell active="/audit" principal={session.principal} environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}><PlatformAudit page={page} filters={filters}/></ControlPlaneShell>;
}
