import { requestWorkspaceJson } from "./workspace-json-request";

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

export interface StorageAdministrationWorkspace extends StorageWorkspace {
  readonly deletionRequests: readonly Readonly<Record<string, unknown>>[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWorkspaceJson(path, {
    service: "Storage service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  })) as T;
}

export function loadStorageWorkspace(): Promise<StorageWorkspace> {
  return request("/v1/storage/workspace");
}

export async function loadStorageAdministration(): Promise<StorageAdministrationWorkspace> {
  const [workspace, deletions] = await Promise.all([
    request<StorageWorkspace>("/v1/storage/workspace"),
    request<{ readonly items: readonly Readonly<Record<string, unknown>>[] }>(
      "/v1/storage/deletion-requests",
    ),
  ]);
  return { ...workspace, deletionRequests: deletions.items };
}

export function loadStorageDeliveryUrl(
  assetId: string,
  rendition?: string,
): Promise<Readonly<{ url: string; expiresAt: string }>> {
  const query = rendition ? `?rendition=${encodeURIComponent(rendition)}` : "";
  return request(`/v1/storage/assets/${assetId}/delivery${query}`);
}

export function mutateStorage(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const direct: Readonly<
    Record<string, Readonly<{ path: string; method: "POST" | "PUT" }>>
  > = {
    namespace: { path: "/v1/storage/namespaces", method: "POST" },
    policy: { path: "/v1/storage/policies", method: "POST" },
    quota: { path: "/v1/storage/quota", method: "PUT" },
    upload: { path: "/v1/storage/uploads", method: "POST" },
    consent: { path: "/v1/storage/recording-consents", method: "POST" },
  };
  const complete = operation.match(/^complete:([0-9a-f-]{36})$/i);
  const accessibility = operation.match(/^accessibility:([0-9a-f-]{36})$/i);
  const deletion = operation.match(/^delete:([0-9a-f-]{36})$/i);
  const approve = operation.match(/^approve-deletion:([0-9a-f-]{36})$/i);
  const withdraw = operation.match(/^withdraw-consent:([0-9a-f-]{36})$/i);
  const directOperation = direct[operation];
  const target =
    directOperation ??
    (complete
      ? {
          path: `/v1/storage/upload-sessions/${complete[1]}/complete`,
          method: "POST" as const,
        }
      : undefined) ??
    (accessibility
      ? {
          path: `/v1/storage/assets/${accessibility[1]}/accessibility`,
          method: "POST" as const,
        }
      : undefined) ??
    (deletion
      ? {
          path: `/v1/storage/assets/${deletion[1]}/deletions`,
          method: "POST" as const,
        }
      : undefined) ??
    (approve
      ? {
          path: `/v1/storage/deletions/${approve[1]}/approve`,
          method: "POST" as const,
        }
      : undefined) ??
    (withdraw
      ? {
          path: `/v1/storage/recording-consents/${withdraw[1]}/withdraw`,
          method: "POST" as const,
        }
      : undefined);
  if (!target) throw new Error("Storage operation is invalid");
  return request(target.path, {
    method: target.method,
    body: JSON.stringify(input),
  });
}
