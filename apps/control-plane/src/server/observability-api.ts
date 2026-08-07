const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 1024 * 1024;

export interface ObservabilityOverview {
  readonly generatedAt: string;
  readonly heartbeats: readonly Readonly<Record<string, unknown>>[];
  readonly sloDefinitions: readonly Readonly<Record<string, unknown>>[];
  readonly sloMeasurements: readonly Readonly<Record<string, unknown>>[];
  readonly alertRules: readonly Readonly<Record<string, unknown>>[];
  readonly alertEvents: readonly Readonly<Record<string, unknown>>[];
  readonly errors: readonly Readonly<Record<string, unknown>>[];
  readonly backlog: Readonly<Record<string, number>>;
}

async function request<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
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
  if (text.length > maximumBytes) throw new Error("Observability response is unexpectedly large");
  const body = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T & { message?: string });
  if (!response.ok) throw new Error(body.message ?? "Observability request failed");
  return body;
}

export function loadObservabilityOverview(accessToken: string): Promise<ObservabilityOverview> {
  return request(accessToken, "/v1/control-plane/observability/overview");
}

export function mutateObservability(
  accessToken: string,
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const sloStatus = operation.match(/^slo-status:([0-9a-f-]{36})$/i);
  const ruleStatus = operation.match(/^rule-status:([0-9a-f-]{36})$/i);
  const alertState = operation.match(/^alert-state:([0-9a-f-]{36})$/i);
  const errorState = operation.match(/^error-state:([0-9a-f-]{36})$/i);
  const runtimeStatus = operation.match(/^runtime-status:([a-z][a-z0-9.-]{2,119})$/);
  const path = operation === "slo-create"
    ? "/v1/control-plane/observability/slos"
    : operation === "rule-create"
      ? "/v1/control-plane/observability/alert-rules"
      : sloStatus
        ? `/v1/control-plane/observability/slos/${sloStatus[1]}/status`
        : ruleStatus
          ? `/v1/control-plane/observability/alert-rules/${ruleStatus[1]}/status`
          : alertState
            ? `/v1/control-plane/observability/alerts/${alertState[1]}/state`
            : errorState
              ? `/v1/control-plane/observability/errors/${errorState[1]}/state`
              : runtimeStatus
                ? `/v1/control-plane/observability/runtimes/${runtimeStatus[1]}/status`
                : undefined;
  if (!path) throw new Error("Observability operation is invalid");
  return request(accessToken, path, { method: "POST", body: JSON.stringify(input) });
}
