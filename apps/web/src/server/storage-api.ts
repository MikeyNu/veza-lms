import {
  requireNumber,
  requireRecord,
  requireRecordArray,
  requireString,
  type JsonRecord,
} from "./json-contract";
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

async function request(path: string, init?: RequestInit): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Storage service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  });
}

function parseStorageWorkspace(value: unknown): StorageWorkspace {
  const record = requireRecord(value, "Storage workspace");
  return {
    tenantId: requireString(record.tenantId, "Storage workspace.tenantId"),
    generatedAt: requireString(record.generatedAt, "Storage workspace.generatedAt"),
    storedBytes: requireNumber(record.storedBytes, "Storage workspace.storedBytes"),
    quota: record.quota === null || record.quota === undefined
      ? null
      : requireRecord(record.quota, "Storage workspace.quota"),
    namespaces: requireRecordArray(record.namespaces, "Storage workspace.namespaces"),
    policies: requireRecordArray(record.policies, "Storage workspace.policies"),
    assets: requireRecordArray(record.assets, "Storage workspace.assets"),
    processingJobs: requireRecordArray(record.processingJobs, "Storage workspace.processingJobs"),
    monthlyUsage: requireRecordArray(record.monthlyUsage, "Storage workspace.monthlyUsage"),
    recordingConsents: requireRecordArray(record.recordingConsents, "Storage workspace.recordingConsents"),
  };
}

export async function loadStorageWorkspace(): Promise<StorageWorkspace> {
  return parseStorageWorkspace(await request("/v1/storage/workspace"));
}

export async function loadStorageAdministration(): Promise<StorageAdministrationWorkspace> {
  const [workspaceValue, deletionsValue] = await Promise.all([
    request("/v1/storage/workspace"),
    request("/v1/storage/deletion-requests"),
  ]);
  const workspace = parseStorageWorkspace(workspaceValue);
  const deletions = requireRecord(deletionsValue, "Storage deletion requests");
  return {
    ...workspace,
    deletionRequests: requireRecordArray(deletions.items, "Storage deletion requests.items"),
  };
}

export async function loadStorageDeliveryUrl(
  assetId: string,
  rendition?: string,
): Promise<Readonly<{ url: string; expiresAt: string }>> {
  const query = rendition ? `?rendition=${encodeURIComponent(rendition)}` : "";
  const payload = requireRecord(
    await request(`/v1/storage/assets/${assetId}/delivery${query}`),
    "Storage delivery response",
  );
  return {
    url: requireString(payload.url, "Storage delivery response.url"),
    expiresAt: requireString(payload.expiresAt, "Storage delivery response.expiresAt"),
  };
}

export async function mutateStorage(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<JsonRecord> {
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
  return requireRecord(
    await request(target.path, {
      method: target.method,
      body: JSON.stringify(input),
    }),
    "Storage mutation response",
  );
}
