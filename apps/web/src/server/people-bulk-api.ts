import { getWebOidcSession } from "./web-session";

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
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
  const response = await fetch(`${baseUrl}/v1/people/bulk-status`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > 256 * 1024) throw new Error("Bulk people response is unexpectedly large");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("People service returned invalid JSON");
  }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body
      ? String((body as { message?: unknown }).message ?? "Bulk people operation failed")
      : "Bulk people operation failed";
    throw new Error(message.slice(0, 300));
  }
  if (!isReceipt(body)) throw new Error("Bulk people receipt did not match the API contract");
  return body;
}
