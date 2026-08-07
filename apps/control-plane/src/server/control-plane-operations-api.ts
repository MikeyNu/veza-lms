const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;

export interface ControlPlaneOperationsOverview {
  readonly generatedAt: string;
  readonly tenants: readonly Readonly<Record<string, unknown>>[];
  readonly supportCases: readonly Readonly<Record<string, unknown>>[];
  readonly securityIncidents: readonly Readonly<Record<string, unknown>>[];
  readonly sessions: Readonly<Record<string, unknown>>;
  readonly entitlementDiagnostics: Readonly<Record<string, unknown>>;
}

export interface TenantOperationsDetail {
  readonly generatedAt: string;
  readonly tenant: Readonly<Record<string, unknown>>;
  readonly lifecycle: readonly Readonly<Record<string, unknown>>[];
  readonly exportReceipts: readonly Readonly<Record<string, unknown>>[];
  readonly retentionHolds: readonly Readonly<Record<string, unknown>>[];
  readonly deletionSchedules: readonly Readonly<Record<string, unknown>>[];
  readonly usage: readonly Readonly<Record<string, unknown>>[];
  readonly usageThresholds: readonly Readonly<Record<string, unknown>>[];
  readonly entitlements: readonly Readonly<Record<string, unknown>>[];
  readonly entitlementHistory: readonly Readonly<Record<string, unknown>>[];
  readonly entitlementDenials: readonly Readonly<Record<string, unknown>>[];
  readonly billingLinks: readonly Readonly<Record<string, unknown>>[];
  readonly release: readonly Readonly<Record<string, unknown>>[];
  readonly supportCases: readonly Readonly<Record<string, unknown>>[];
  readonly supportSessions: readonly Readonly<Record<string, unknown>>[];
  readonly securityIncidents: readonly Readonly<Record<string, unknown>>[];
}

export interface SupportOperationsOverview {
  readonly generatedAt: string;
  readonly cases: readonly Readonly<Record<string, unknown>>[];
  readonly sessions: readonly Readonly<Record<string, unknown>>[];
  readonly incidents: readonly Readonly<Record<string, unknown>>[];
}

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (text.length > maximumBytes) throw new Error("Control-plane response is unexpectedly large");
  let body: T & { message?: string };
  try {
    body = text ? JSON.parse(text) as T & { message?: string } : {} as T & { message?: string };
  } catch {
    throw new Error("Control-plane API returned invalid JSON");
  }
  if (!response.ok) throw new Error(body.message ?? "Control-plane operation failed");
  return body;
}

export function loadOperationsOverview(accessToken: string): Promise<ControlPlaneOperationsOverview> {
  return request(accessToken, "/v1/control-plane/operations/overview");
}

export function loadTenantOperations(accessToken: string, tenantId: string): Promise<TenantOperationsDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error("Tenant identifier is invalid");
  return request(accessToken, `/v1/control-plane/operations/tenants/${tenantId}`);
}

export function loadSupportOperations(accessToken: string): Promise<SupportOperationsOverview> {
  return request(accessToken, "/v1/control-plane/operations/support");
}

export function mutateControlPlaneOperations(
  accessToken: string,
  operation: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
): Promise<Readonly<Record<string, unknown>>> {
  const tenant = operation.match(/^tenant:([0-9a-f-]{36}):(profile|health|lifecycle|export|hold|deletion|entitlement|threshold|billing)$/i);
  const exportComplete = operation.match(/^export:([0-9a-f-]{36}):([0-9a-f-]{36}):complete$/i);
  const holdRelease = operation.match(/^hold:([0-9a-f-]{36}):([0-9a-f-]{36}):release$/i);
  const deletionCancel = operation.match(/^deletion:([0-9a-f-]{36}):([0-9a-f-]{36}):cancel$/i);
  const approval = operation.match(/^support:([0-9a-f-]{36}):approval$/i);
  const elevation = operation.match(/^support:([0-9a-f-]{36}):elevation$/i);
  const resolve = operation.match(/^support:([0-9a-f-]{36}):resolve$/i);
  const terminate = operation.match(/^session:([0-9a-f-]{36}):terminate$/i);
  const incidentTransition = operation.match(/^incident:([0-9a-f-]{36}):transition$/i);

  let path: string | undefined;
  let method = "POST";
  if (tenant) {
    const [, tenantId, action] = tenant;
    if (!tenantId || !action) throw new Error("Control-plane tenant operation is invalid");
    const suffix = action === "profile" ? "profile"
      : action === "health" ? "health"
      : action === "lifecycle" ? "lifecycle"
      : action === "export" ? "exports"
      : action === "hold" ? "retention-holds"
      : action === "deletion" ? "deletion-schedules"
      : action === "entitlement" ? "entitlement-overrides"
      : action === "threshold" ? "usage-thresholds" : "billing-link";
    path = `/v1/control-plane/operations/tenants/${tenantId}/${suffix}`;
    if (["profile", "health", "entitlement", "threshold", "billing"].includes(action)) method = "PUT";
  } else if (exportComplete) {
    path = `/v1/control-plane/operations/tenants/${exportComplete[1]}/exports/${exportComplete[2]}/complete`;
  } else if (holdRelease) {
    path = `/v1/control-plane/operations/tenants/${holdRelease[1]}/retention-holds/${holdRelease[2]}/release`;
  } else if (deletionCancel) {
    path = `/v1/control-plane/operations/tenants/${deletionCancel[1]}/deletion-schedules/${deletionCancel[2]}/cancel`;
  } else if (operation === "support:create") {
    path = "/v1/control-plane/operations/support/cases";
  } else if (approval) {
    path = `/v1/control-plane/operations/support/cases/${approval[1]}/customer-approval`;
  } else if (elevation) {
    path = `/v1/control-plane/operations/support/cases/${elevation[1]}/elevation`;
  } else if (resolve) {
    path = `/v1/control-plane/operations/support/cases/${resolve[1]}/resolve`;
  } else if (terminate) {
    path = `/v1/control-plane/operations/support/sessions/${terminate[1]}/terminate`;
  } else if (operation === "incident:create") {
    path = "/v1/control-plane/operations/security-incidents";
  } else if (incidentTransition) {
    path = `/v1/control-plane/operations/security-incidents/${incidentTransition[1]}/transition`;
  }
  if (!path) throw new Error("Control-plane operation is invalid");
  return request(accessToken, path, {
    method,
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
}
