import { requestWorkspaceJson } from "./workspace-json-request";

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
  return (await requestWorkspaceJson(path, {
    service: "Communications service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  })) as T;
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
  const path =
    direct[operation] ??
    (versionCreate
      ? `/v1/communications/templates/${versionCreate[1]}/versions`
      : undefined) ??
    (versionSubmit
      ? `/v1/communications/template-versions/${versionSubmit[1]}/submit`
      : undefined) ??
    (versionApprove
      ? `/v1/communications/template-versions/${versionApprove[1]}/approve`
      : undefined) ??
    (senderVerify
      ? `/v1/communications/senders/${senderVerify[1]}/verify`
      : undefined);
  if (!path) throw new Error("Communications operation is invalid");
  return request(path, { method: "POST", body: JSON.stringify(input) });
}
