import type { DeploymentTier, TenantId, TenantModuleKey, TenantStatus } from "@veza/contracts";

const maximumResponseBytes = 256 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set<TenantStatus>(["provisioning", "active", "suspended", "offboarding", "closed"]);
const tiers = new Set<DeploymentTier>(["shared", "protected", "sovereign"]);
const modules = new Set<TenantModuleKey>(["core", "studio-pro", "exams", "commerce", "advanced-analytics", "credentials", "guardian-portal", "ai-assist", "integration-hub"]);

export interface TenantFleetFilters {
  readonly query?: string;
  readonly status?: TenantStatus;
  readonly planKey?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface TenantFleetItem {
  readonly id: TenantId;
  readonly slug: string;
  readonly displayName: string;
  readonly legalName: string;
  readonly status: TenantStatus;
  readonly deploymentTier: DeploymentTier;
  readonly residencyRegion: string;
  readonly planKey: string;
  readonly locale: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly activeMemberships: number;
  readonly pendingInvitations: number;
  readonly pendingEvents: number;
  readonly modules: readonly TenantModuleKey[];
}

export interface TenantFleetPage {
  readonly items: readonly TenantFleetItem[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }

function item(value: unknown): TenantFleetItem {
  if (!isRecord(value) || !uuidPattern.test(String(value.id)) || !string(value.slug) || !string(value.displayName) || !string(value.legalName)) throw new Error("Tenant fleet item did not match the API contract");
  if (!statuses.has(value.status as TenantStatus) || !tiers.has(value.deploymentTier as DeploymentTier) || !string(value.residencyRegion) || !string(value.planKey) || !string(value.locale) || !string(value.timezone)) throw new Error("Tenant fleet state did not match the API contract");
  if (!string(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || !integer(value.activeMemberships) || !integer(value.pendingInvitations) || !integer(value.pendingEvents)) throw new Error("Tenant fleet operating counts did not match the API contract");
  if (!Array.isArray(value.modules) || !value.modules.every((candidate) => modules.has(candidate as TenantModuleKey))) throw new Error("Tenant fleet modules did not match the API contract");
  return {
    id: value.id as TenantId,
    slug: value.slug,
    displayName: value.displayName,
    legalName: value.legalName,
    status: value.status as TenantStatus,
    deploymentTier: value.deploymentTier as DeploymentTier,
    residencyRegion: value.residencyRegion,
    planKey: value.planKey,
    locale: value.locale,
    timezone: value.timezone,
    createdAt: value.createdAt,
    activeMemberships: value.activeMemberships,
    pendingInvitations: value.pendingInvitations,
    pendingEvents: value.pendingEvents,
    modules: value.modules as TenantModuleKey[],
  };
}

async function request(accessToken: string, path: string): Promise<unknown> {
  const response = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/tenants${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) throw new Error("Tenant fleet response is unexpectedly large");
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Tenant fleet response is unexpectedly large");
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; } catch { throw new Error("Tenant fleet returned invalid JSON"); }
  if (!response.ok) throw new Error(`Tenant fleet API failed with status ${response.status}`);
  return payload;
}

export async function loadTenantFleet(accessToken: string, filters: TenantFleetFilters): Promise<TenantFleetPage> {
  const query = new URLSearchParams();
  if (filters.query) query.set("query", filters.query);
  if (filters.status) query.set("status", filters.status);
  if (filters.planKey) query.set("planKey", filters.planKey);
  if (filters.cursor) query.set("cursor", filters.cursor);
  query.set("limit", String(filters.limit ?? 30));
  const payload = await request(accessToken, `?${query.toString()}`);
  if (!isRecord(payload) || !Array.isArray(payload.items) || !isRecord(payload.page) || !integer(payload.page.limit) || payload.page.limit < 1 || payload.page.limit > 100) throw new Error("Tenant fleet page did not match the API contract");
  if (payload.page.nextCursor !== undefined && !string(payload.page.nextCursor)) throw new Error("Tenant fleet cursor did not match the API contract");
  return { items: payload.items.map(item), page: { limit: payload.page.limit, ...(payload.page.nextCursor ? { nextCursor: payload.page.nextCursor } : {}) };
}

export async function loadTenantDetail(accessToken: string, tenantId: TenantId): Promise<TenantFleetItem> {
  return item(await request(accessToken, `/${tenantId}`));
}
