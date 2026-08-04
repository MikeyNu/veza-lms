import type {
  BaselineRoleKey,
  DeploymentTier,
  EntitlementState,
  MembershipStatus,
  TenantModuleKey,
  TenantStatus,
  WorkspaceOption,
  WorkspaceSession,
} from "@veza/contracts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roleKeys = new Set<BaselineRoleKey>([
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
  "auditor",
  "support-agent",
]);
const moduleKeys = new Set<TenantModuleKey>([
  "core",
  "studio-pro",
  "exams",
  "commerce",
  "advanced-analytics",
  "credentials",
  "guardian-portal",
  "ai-assist",
  "integration-hub",
]);
const entitlementStates = new Set<EntitlementState>(["enabled", "disabled", "trial"]);
const tenantStatuses = new Set<TenantStatus>(["provisioning", "active", "suspended", "offboarding", "closed"]);
const membershipStatuses = new Set<MembershipStatus>(["invited", "active", "suspended", "expired", "revoked"]);
const deploymentTiers = new Set<DeploymentTier>(["shared", "protected", "sovereign"]);
const maximumWorkspaceOptions = 100;

export class WorkspaceApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isRole(value: unknown): value is BaselineRoleKey {
  return typeof value === "string" && roleKeys.has(value as BaselineRoleKey);
}

function isTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === "string" && tenantStatuses.has(value as TenantStatus);
}

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === "string" && membershipStatuses.has(value as MembershipStatus);
}

function isDeploymentTier(value: unknown): value is DeploymentTier {
  return typeof value === "string" && deploymentTiers.has(value as DeploymentTier);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isLimits(value: unknown): value is Readonly<Record<string, number | string | boolean>> {
  return isRecord(value) && Object.values(value).every((item) =>
    typeof item === "number" || typeof item === "string" || typeof item === "boolean",
  );
}

function isWorkspaceOption(value: unknown): value is WorkspaceOption {
  if (!isRecord(value) || !isUuid(value.membershipId) || !Array.isArray(value.roles) || value.roles.length === 0 || !value.roles.every(isRole)) return false;
  const tenant = value.tenant;
  return isRecord(tenant)
    && isUuid(tenant.id)
    && isString(tenant.slug)
    && isString(tenant.displayName)
    && isTenantStatus(tenant.status)
    && isString(value.label)
    && (tenant.logoUrl === undefined || typeof tenant.logoUrl === "string");
}

function isWorkspaceSession(value: unknown): value is WorkspaceSession {
  if (!isRecord(value) || !isRecord(value.principal) || !isRecord(value.tenant) || !isRecord(value.membership)) return false;
  if (!isUuid(value.principal.userId) || !isOptionalString(value.principal.displayName) || !isOptionalString(value.principal.email)) return false;
  if (!isUuid(value.tenant.id) || !isUuid(value.membership.id)) return false;
  if (!isString(value.tenant.slug) || !isString(value.tenant.displayName) || !isTenantStatus(value.tenant.status)) return false;
  if (!isDeploymentTier(value.tenant.deploymentTier) || !isString(value.tenant.residencyRegion) || !isString(value.tenant.planKey)) return false;
  if (!isString(value.tenant.locale) || !isString(value.tenant.timezone) || !isOptionalString(value.tenant.logoUrl)) return false;
  if (!isMembershipStatus(value.membership.status) || !isString(value.membership.locale) || !isString(value.membership.timezone)) return false;
  if (!Array.isArray(value.membership.roles) || value.membership.roles.length === 0 || !value.membership.roles.every(isRole)) return false;
  if (!Array.isArray(value.membership.institutionIds) || !value.membership.institutionIds.every(isUuid)) return false;
  if (!Array.isArray(value.entitlements)) return false;
  return value.entitlements.every((entitlement) => isRecord(entitlement)
    && typeof entitlement.module === "string"
    && moduleKeys.has(entitlement.module as TenantModuleKey)
    && typeof entitlement.state === "string"
    && entitlementStates.has(entitlement.state as EntitlementState)
    && isLimits(entitlement.limits)
    && (entitlement.validUntil === undefined || (typeof entitlement.validUntil === "string" && Number.isFinite(Date.parse(entitlement.validUntil)))));
}

function apiBaseUrl(): string {
  return process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
}

async function jsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > 256 * 1024) throw new WorkspaceApiError(502, "Workspace API response is unexpectedly large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WorkspaceApiError(502, "Workspace API returned invalid JSON");
  }
}

export async function listWorkspaceOptions(accessToken: string): Promise<readonly WorkspaceOption[]> {
  const response = await fetch(`${apiBaseUrl()}/v1/session/workspaces`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new WorkspaceApiError(response.status, "Workspace options could not be loaded");
  const payload = await jsonResponse(response);
  if (!Array.isArray(payload) || payload.length > maximumWorkspaceOptions || !payload.every(isWorkspaceOption)) {
    throw new WorkspaceApiError(502, "Workspace options did not match the API contract");
  }
  return payload;
}

export async function loadWorkspaceSession(accessToken: string, membershipId: string): Promise<WorkspaceSession> {
  if (!uuidPattern.test(membershipId)) throw new WorkspaceApiError(400, "Membership selector is invalid");
  const response = await fetch(`${apiBaseUrl()}/v1/session/workspace`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-veza-membership-id": membershipId,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new WorkspaceApiError(response.status, "Workspace session could not be loaded");
  const payload = await jsonResponse(response);
  if (!isWorkspaceSession(payload)) throw new WorkspaceApiError(502, "Workspace session did not match the API contract");
  if (!payload.entitlements.some((entitlement) => entitlement.module === "core" && entitlement.state !== "disabled")) {
    throw new WorkspaceApiError(502, "Workspace session is missing the mandatory core entitlement");
  }
  return payload;
}
