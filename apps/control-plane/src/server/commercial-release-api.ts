const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 3 * 1024 * 1024;

export interface CommercialGovernanceOverview {
  readonly generatedAt: string;
  readonly plans: readonly Readonly<Record<string, unknown>>[];
  readonly modules: readonly Readonly<Record<string, unknown>>[];
  readonly policies: readonly Readonly<Record<string, unknown>>[];
  readonly policyModules: readonly Readonly<Record<string, unknown>>[];
  readonly history: readonly Readonly<Record<string, unknown>>[];
  readonly assignments: readonly Readonly<Record<string, unknown>>[];
  readonly denials: readonly Readonly<Record<string, unknown>>[];
}

export interface ReleaseCompletionOverview {
  readonly generatedAt: string;
  readonly versions: readonly Readonly<Record<string, unknown>>[];
  readonly rings: readonly Readonly<Record<string, unknown>>[];
  readonly targets: readonly Readonly<Record<string, unknown>>[];
  readonly featureFlags: readonly Readonly<Record<string, unknown>>[];
  readonly ringFeatureFlags: readonly Readonly<Record<string, unknown>>[];
  readonly assignments: readonly Readonly<Record<string, unknown>>[];
  readonly exceptions: readonly Readonly<Record<string, unknown>>[];
  readonly compatibility: readonly Readonly<Record<string, unknown>>[];
  readonly migrations: readonly Readonly<Record<string, unknown>>[];
  readonly rollbacks: readonly Readonly<Record<string, unknown>>[];
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
  if (text.length > maximumBytes) throw new Error("Control-plane governance response is unexpectedly large");
  let body: T & { message?: string };
  try {
    body = text ? JSON.parse(text) as T & { message?: string } : {} as T & { message?: string };
  } catch {
    throw new Error("Control-plane governance API returned invalid JSON");
  }
  if (!response.ok) throw new Error(body.message ?? "Control-plane governance operation failed");
  return body;
}

export function loadCommercialGovernance(accessToken: string): Promise<CommercialGovernanceOverview> {
  return request(accessToken, "/v1/control-plane/commercial-governance/overview");
}

export function loadReleaseCompletion(accessToken: string): Promise<ReleaseCompletionOverview> {
  return request(accessToken, "/v1/control-plane/release-completion/overview");
}

export function mutateCommercialGovernance(
  accessToken: string,
  operation: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
): Promise<Readonly<Record<string, unknown>>> {
  const transition = operation.match(/^policy:([0-9a-f-]{36}):transition$/i);
  const assignment = operation.match(/^tenant:([0-9a-f-]{36}):plan$/i);
  let path: string | undefined;
  let method = "POST";
  if (operation === "module:upsert") {
    path = "/v1/control-plane/commercial-governance/modules";
    method = "PUT";
  } else if (operation === "policy:create") {
    path = "/v1/control-plane/commercial-governance/plan-policies";
  } else if (transition) {
    path = `/v1/control-plane/commercial-governance/plan-policies/${transition[1]}/transition`;
  } else if (assignment) {
    path = `/v1/control-plane/commercial-governance/tenants/${assignment[1]}/plan-assignment`;
  }
  if (!path) throw new Error("Commercial governance operation is invalid");
  return request(accessToken, path, {
    method,
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function mutateReleaseCompletion(
  accessToken: string,
  operation: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
): Promise<Readonly<Record<string, unknown>>> {
  const versionTransition = operation.match(/^version:([0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?):transition$/);
  const targetTransition = operation.match(/^target:([0-9a-f-]{36}):transition$/i);
  let path: string | undefined;
  let method = "POST";
  if (operation === "version:create") path = "/v1/control-plane/release-completion/versions";
  else if (versionTransition) path = `/v1/control-plane/release-completion/versions/${versionTransition[1]}/transition`;
  else if (operation === "target:create") path = "/v1/control-plane/release-completion/ring-targets";
  else if (targetTransition) path = `/v1/control-plane/release-completion/ring-targets/${targetTransition[1]}/transition`;
  else if (operation === "exception:set") {
    path = "/v1/control-plane/release-completion/tenant-exception";
    method = "PUT";
  } else if (operation === "compatibility:record") path = "/v1/control-plane/release-completion/compatibility";
  else if (operation === "migration:update") {
    path = "/v1/control-plane/release-completion/migration";
    method = "PUT";
  } else if (operation === "rollback:create") path = "/v1/control-plane/release-completion/rollbacks";
  if (!path) throw new Error("Release governance operation is invalid");
  return request(accessToken, path, {
    method,
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
}
