import {
  optionalString,
  requireInteger,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
  requireStringArray,
  type JsonRecord,
} from "./json-contract";
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

async function request(path: string, init?: RequestInit): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Service account service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  });
}

function parseServiceAccount(value: unknown, label: string): ServiceAccountView {
  const item = requireRecord(value, label);
  const principal = requireRecord(item.principal, `${label}.principal`);
  const activeSecret = item.activeSecret === undefined || item.activeSecret === null
    ? undefined
    : requireRecord(item.activeSecret, `${label}.activeSecret`);
  const lastUsedAt = optionalString(item.lastUsedAt, `${label}.lastUsedAt`);
  const principalEmail = optionalString(principal.email, `${label}.principal.email`);
  const principalDisplayName = optionalString(principal.displayName, `${label}.principal.displayName`);
  const secretCreatedAt = activeSecret
    ? optionalString(activeSecret.createdAt, `${label}.activeSecret.createdAt`)
    : undefined;

  return {
    id: requireString(item.id, `${label}.id`),
    clientId: requireString(item.clientId, `${label}.clientId`),
    displayName: requireString(item.displayName, `${label}.displayName`),
    scopes: requireStringArray(item.scopes, `${label}.scopes`),
    allowedIpCidrs: requireStringArray(item.allowedIpCidrs, `${label}.allowedIpCidrs`),
    tokenTtlSeconds: requireInteger(item.tokenTtlSeconds, `${label}.tokenTtlSeconds`),
    status: requireOneOf(item.status, ["active", "suspended", "retired"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
    ...(lastUsedAt ? { lastUsedAt } : {}),
    createdAt: requireString(item.createdAt, `${label}.createdAt`),
    updatedAt: requireString(item.updatedAt, `${label}.updatedAt`),
    principal: {
      userId: requireString(principal.userId, `${label}.principal.userId`),
      ...(principalEmail ? { email: principalEmail } : {}),
      ...(principalDisplayName ? { displayName: principalDisplayName } : {}),
    },
    ...(activeSecret ? {
      activeSecret: {
        prefix: requireString(activeSecret.prefix, `${label}.activeSecret.prefix`),
        ...(secretCreatedAt ? { createdAt: secretCreatedAt } : {}),
      },
    } : {}),
  };
}

export async function loadServiceAccounts(): Promise<ServiceAccountDirectory> {
  const payload = requireRecord(await request("/v1/service-accounts"), "Service account directory");
  return {
    items: requireRecordArray(payload.items, "Service account directory.items").map((item, index) =>
      parseServiceAccount(item, `Service account directory.items[${index}]`),
    ),
  };
}

export async function mutateServiceAccount(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<JsonRecord> {
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
  return requireRecord(
    await request(path, { method: "POST", body: JSON.stringify(input) }),
    "Service account mutation response",
  );
}
