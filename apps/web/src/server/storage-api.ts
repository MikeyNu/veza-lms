import { getWebOidcSession } from "./web-session";

const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 1024 * 1024;

export interface StorageWorkspace {
  readonly tenantId: string;
  readonly generatedAt: string;
  readonly storedBytes: number;
  readonly quota: Readonly<Record<string, unknown>> | null;
  readonly namespaces: readonly Readonly<Record<string, unknown>>[];
  readonly policies: readonly Readonly<Record<string, unknown>>[];
  readonly assets: readonly Readonly<Record<string, unknown>>[];
  readonly processingJobs: readonly Readonly<Record<string, unknown>>[];
  readonly monthlyUsage: readonly Readonly<Record<string, unknown>>[];
  readonly recordingConsents: readonly Readonly<Record<string, unknown>>[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
  const text = await response.text();
  if (text.length > maximumBytes) throw new Error("Storage response is unexpectedly large");
  const body = JSON.parse(text) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Storage request failed");
  return body;
}

export function loadStorageWorkspace(): Promise<StorageWorkspace> {
  return request("/v1/storage/workspace");
}

export function mutateStorage(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const direct: Readonly<Record<string, string>> = {
    namespace: "/v1/storage/namespaces",
    policy: "/v1/storage/policies",
    upload: "/v1/storage/uploads",
    consent: "/v1/storage/recording-consents",
  };
  const complete = operation.match(/^complete:([0-9a-f-]{36})$/i);
  const accessibility = operation.match(/^accessibility:([0-9a-f-]{36})$/i);
  const deletion = operation.match(/^delete:([0-9a-f-]{36})$/i);
  const path = direct[operation]
    ?? (complete ? `/v1/storage/upload-sessions/${complete[1]}/complete` : undefined)
    ?? (accessibility ? `/v1/storage/assets/${accessibility[1]}/accessibility` : undefined)
    ?? (deletion ? `/v1/storage/assets/${deletion[1]}/deletions` : undefined);
  if (!path) throw new Error("Storage operation is invalid");
  return request(path, { method: "POST", body: JSON.stringify(input) });
}
