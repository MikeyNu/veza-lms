import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 512 * 1024;

export interface CommunicationsWorkspace {
  readonly tenantId: string;
  readonly generatedAt: string;
  readonly templates: readonly Readonly<Record<string, unknown>>[];
  readonly senders: readonly Readonly<Record<string, unknown>>[];
  readonly preferences: readonly Readonly<Record<string, unknown>>[];
  readonly recentDeliveries: readonly Readonly<Record<string, unknown>>[];
  readonly activeSuppressions: readonly Readonly<Record<string, unknown>>[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new Error("Communications response is unexpectedly large");
  }
  const text = await response.text();
  if (text.length > maximumBytes) throw new Error("Communications response is unexpectedly large");
  const body = JSON.parse(text) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Communications request failed");
  return body;
}

export function loadCommunicationsWorkspace(): Promise<CommunicationsWorkspace> {
  return request("/v1/communications/workspace");
}

export function mutateCommunications(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const direct: Readonly<Record<string, string>> = {
    "template-create": "/v1/communications/templates",
    "sender-create": "/v1/communications/senders",
    preference: "/v1/communications/preferences",
    intent: "/v1/communications/intents",
  };
  const versionCreate = operation.match(/^template-version:([0-9a-f-]{36})$/i);
  const versionSubmit = operation.match(/^template-submit:([0-9a-f-]{36})$/i);
  const versionApprove = operation.match(/^template-approve:([0-9a-f-]{36})$/i);
  const senderVerify = operation.match(/^sender-verify:([0-9a-f-]{36})$/i);
  const path = direct[operation]
    ?? (versionCreate ? `/v1/communications/templates/${versionCreate[1]}/versions` : undefined)
    ?? (versionSubmit ? `/v1/communications/template-versions/${versionSubmit[1]}/submit` : undefined)
    ?? (versionApprove ? `/v1/communications/template-versions/${versionApprove[1]}/approve` : undefined)
    ?? (senderVerify ? `/v1/communications/senders/${senderVerify[1]}/verify` : undefined);
  if (!path) throw new Error("Communications operation is invalid");
  return request(path, { method: "POST", body: JSON.stringify(input) });
}
