const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvitationApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface InvitationAcceptanceReceipt {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly status: "active";
}

function apiBaseUrl(): string {
  return process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
}

function isReceipt(value: unknown): value is InvitationAcceptanceReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return uuidPattern.test(String(record.tenantId ?? ""))
    && uuidPattern.test(String(record.membershipId ?? ""))
    && record.status === "active";
}

export async function acceptMembershipInvitation(
  accessToken: string,
  invitationId: string,
  token: string,
): Promise<InvitationAcceptanceReceipt> {
  if (!uuidPattern.test(invitationId) || token.length < 32 || token.length > 2048) {
    throw new InvitationApiError(400, "Invitation details are invalid");
  }
  const response = await fetch(`${apiBaseUrl()}/v1/membership-invitations/accept`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ invitationId, token }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (text.length > 64 * 1024) throw new InvitationApiError(502, "Invitation response is unexpectedly large");
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new InvitationApiError(502, "Invitation service returned invalid JSON");
  }
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "Invitation could not be accepted")
      : "Invitation could not be accepted";
    throw new InvitationApiError(response.status, message);
  }
  if (!isReceipt(payload)) throw new InvitationApiError(502, "Invitation receipt did not match the API contract");
  return payload;
}
