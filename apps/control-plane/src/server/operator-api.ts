import type { AuthenticatedPrincipal } from "@veza/contracts";

const maximumResponseBytes = 64 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function isPrincipal(value: unknown): value is AuthenticatedPrincipal {
  return isRecord(value)
    && typeof value.userId === "string"
    && uuidPattern.test(value.userId)
    && typeof value.subject === "string"
    && value.subject.length > 0
    && (value.email === undefined || typeof value.email === "string")
    && (value.displayName === undefined || typeof value.displayName === "string")
    && isStringArray(value.platformRoles)
    && value.platformRoles.includes("veza:platform-operator")
    && isStringArray(value.authenticationMethods)
    && typeof value.issuedAt === "string"
    && Number.isFinite(Date.parse(value.issuedAt));
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error("Operator API response is unexpectedly large");
  }
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new Error("Operator API response is unexpectedly large");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Operator API returned invalid JSON");
  }
}

export async function loadOperatorPrincipal(accessToken: string): Promise<AuthenticatedPrincipal | undefined> {
  const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
  const response = await fetch(`${apiBaseUrl}/v1/session/principal`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) return undefined;
  if (!response.ok) throw new Error(`Operator API failed with status ${response.status}`);
  const principal = await boundedJson(response);
  if (!isPrincipal(principal)) throw new Error("Operator principal did not match the API contract");
  return principal;
}
