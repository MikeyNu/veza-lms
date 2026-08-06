import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 256 * 1024;

export interface ServiceAccountView {
  readonly id: string;
  readonly clientId: string;
  readonly displayName: string;
  readonly scopes: readonly string[];
  readonly allowedIpCidrs: readonly string[];
  readonly tokenTtlSeconds: number;
  readonly status: "active" | "suspended" | "retired";
  readonly version: number;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly principal: Readonly<{
    userId: string;
    email?: string;
    displayName?: string;
  }>;
  readonly activeSecret?: Readonly<{
    prefix: string;
    createdAt?: string;
  }>;
}

export interface ServiceAccountDirectory {
  readonly items: readonly ServiceAccountView[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWorkspaceJson(path, {
    service: "Service account service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  })) as T;
}

export function loadServiceAccounts(): Promise<ServiceAccountDirectory> {
  return request("/v1/service-accounts");
}

export function mutateServiceAccount(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> {
  const rotate = operation.match(/^rotate:([0-9a-f-]{36})$/i);
  const status = operation.match(/^status:([0-9a-f-]{36})$/i);
  const path =
    operation === "create"
      ? "/v1/service-accounts"
      : rotate
        ? `/v1/service-accounts/${rotate[1]}/rotate-secret`
        : status
          ? `/v1/service-accounts/${status[1]}/status`
          : undefined;
  if (!path) throw new Error("Service account operation is invalid");
  return request(path, { method: "POST", body: JSON.stringify(input) });
}
