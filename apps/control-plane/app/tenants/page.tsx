import type { TenantId, TenantStatus } from "@veza/contracts";
import { ControlPlaneShell } from "../../src/components/control-plane-shell";
import { TenantFleet } from "../../src/features/tenants/tenant-fleet";
import { loadTenantDetail, loadTenantFleet, type TenantFleetFilters } from "../../src/server/tenant-fleet-api";
import { requireOperatorSession } from "../../src/server/operator-session";

export const dynamic = "force-dynamic";
type Query = Readonly<Record<string, string | string[] | undefined>>;
const statuses = new Set<TenantStatus>(["provisioning", "active", "suspended", "offboarding", "closed"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }

export default async function TenantsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [session, query] = await Promise.all([requireOperatorSession(), searchParams]);
  const queryText = single(query.query);
  const planKey = single(query.planKey);
  const cursor = single(query.cursor);
  const requestedStatus = single(query.status);
  const status = requestedStatus && statuses.has(requestedStatus as TenantStatus) ? requestedStatus as TenantStatus : undefined;
  const filters: TenantFleetFilters = { ...(queryText ? { query: queryText } : {}), ...(planKey ? { planKey } : {}), ...(cursor ? { cursor } : {}), ...(status ? { status } : {}), limit: 30 };
  const fleet = await loadTenantFleet(session.oidc.accessToken, filters);
  const selectedId = single(query.tenant);
  const selected = selectedId && uuidPattern.test(selectedId)
    ? fleet.items.find((tenant) => tenant.id === selectedId) ?? await loadTenantDetail(session.oidc.accessToken, selectedId as TenantId)
    : fleet.items[0];
  return <ControlPlaneShell active="/tenants" principal={session.principal} environmentLabel={process.env.VEZA_ENVIRONMENT_LABEL ?? "Local development"}><TenantFleet fleet={fleet} selected={selected} filters={filters}/></ControlPlaneShell>;
}
