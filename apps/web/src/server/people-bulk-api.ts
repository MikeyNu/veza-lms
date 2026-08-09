import { demoPeopleBulkReceipt } from "./demo-direct-data";
import { demoModeEnabled } from "./demo-mode";
import { requestWorkspaceJson } from "./workspace-json-request";

export interface PeopleBulkStatusInput {
  readonly records: readonly { readonly personId: string; readonly expectedVersion: number }[];
  readonly status: "active" | "inactive";
  readonly reason: string;
}

export interface PeopleBulkStatusReceipt {
  readonly operationId: string;
  readonly requestedCount: number;
  readonly changedCount: number;
  readonly unchangedCount: number;
  readonly status: "active" | "inactive";
}

function isReceipt(value: unknown): value is PeopleBulkStatusReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.operationId === "string"
    && Number.isInteger(item.requestedCount)
    && Number.isInteger(item.changedCount)
    && Number.isInteger(item.unchangedCount)
    && (item.status === "active" || item.status === "inactive");
}

export async function changePeopleBulkStatus(input: PeopleBulkStatusInput): Promise<PeopleBulkStatusReceipt> {
  if (demoModeEnabled()) {
    return demoPeopleBulkReceipt(input);
  }
  const body = await requestWorkspaceJson("/v1/people/bulk-status", {
    service: "People service",
    maximumBytes: 256 * 1024,
    timeoutMs: 20_000,
    init: {
      method: "POST",
      body: JSON.stringify(input),
    },
  });
  if (!isReceipt(body)) throw new Error("Bulk people receipt did not match the API contract");
  return body;
}
