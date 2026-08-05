const maximumResponseBytes = 64 * 1024;

export interface PlanView {
  readonly key: string;
  readonly displayName: string;
  readonly active: boolean;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly tenantCount: number;
  readonly activeTenantCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function count(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }

function plan(value: unknown): PlanView {
  if (!isRecord(value) || !string(value.key) || !string(value.displayName) || typeof value.active !== "boolean" || !isRecord(value.limits) || !count(value.tenantCount) || !count(value.activeTenantCount)) {
    throw new Error("Plan did not match the API contract");
  }
  return {
    key: value.key,
    displayName: value.displayName,
    active: value.active,
    limits: value.limits,
    tenantCount: value.tenantCount,
    activeTenantCount: value.activeTenantCount,
  };
}

export async function loadPlans(accessToken: string): Promise<readonly PlanView[]> {
  const response = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/plans`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Plans response is unexpectedly large");
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; } catch { throw new Error("Plans API returned invalid JSON"); }
  if (!response.ok) throw new Error(`Plans API failed with status ${response.status}`);
  if (!Array.isArray(payload) || payload.length > 100) throw new Error("Plans response did not match the API contract");
  return payload.map(plan);
}
