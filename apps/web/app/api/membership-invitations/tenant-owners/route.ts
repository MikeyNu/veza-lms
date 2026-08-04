import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { membershipCookieName } from "../../../../src/server/auth-config";
import { getWebOidcSession } from "../../../../src/server/web-session";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumRequestBytes = 16 * 1024;
const maximumResponseBytes = 64 * 1024;

interface InvitationResponse {
  readonly invitationId: string;
  readonly deliveryStatus: "queued";
  readonly expiresAt: string;
}

function apiBaseUrl(): string {
  return process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invitationResponse(value: unknown): InvitationResponse | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.invitationId !== "string" || !uuidPattern.test(value.invitationId)) return undefined;
  if (value.deliveryStatus !== "queued") return undefined;
  if (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) return undefined;
  return { invitationId: value.invitationId, deliveryStatus: "queued", expiresAt: value.expiresAt };
}

function safeErrorMessage(value: unknown, status: number): string {
  if (isRecord(value)) {
    if (typeof value.message === "string" && value.message.length <= 240) return value.message;
    if (Array.isArray(value.message) && value.message.every((item) => typeof item === "string")) {
      return value.message.slice(0, 4).join(" ").slice(0, 240);
    }
  }
  if (status === 403) return "You do not have permission to invite a tenant owner.";
  if (status === 409) return "An active invitation already exists for this owner.";
  return "The invitation could not be queued.";
}

export async function POST(request: NextRequest) {
  const noStoreHeaders = { "cache-control": "no-store" };
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Request origin could not be verified" }, { status: 403, headers: noStoreHeaders });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "JSON request body is required" }, { status: 415, headers: noStoreHeaders });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength > maximumRequestBytes) return NextResponse.json({ message: "Request body is too large" }, { status: 413, headers: noStoreHeaders });

  const [session, membershipId] = await Promise.all([
    getWebOidcSession(),
    Promise.resolve(request.cookies.get(membershipCookieName)?.value),
  ]);
  if (!session || !membershipId) return NextResponse.json({ message: "An active workspace session is required" }, { status: 401, headers: noStoreHeaders });
  if (!uuidPattern.test(membershipId)) return NextResponse.json({ message: "Workspace membership is invalid" }, { status: 400, headers: noStoreHeaders });

  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > maximumRequestBytes) return NextResponse.json({ message: "Request body is too large" }, { status: 413, headers: noStoreHeaders });
    input = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ message: "Request body is invalid" }, { status: 400, headers: noStoreHeaders });
  }
  if (!isRecord(input)) return NextResponse.json({ message: "Request body is invalid" }, { status: 400, headers: noStoreHeaders });
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const expiresInDays = typeof input.expiresInDays === "number" ? input.expiresInDays : NaN;
  if (!emailPattern.test(email) || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    return NextResponse.json({ message: "Email or invitation validity is invalid" }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const response = await fetch(`${apiBaseUrl()}/v1/membership-invitations/tenant-owners`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-veza-membership-id": membershipId,
        "x-correlation-id": randomUUID(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, expiresInDays }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (text.length > maximumResponseBytes) return NextResponse.json({ message: "Invitation service response was invalid" }, { status: 502, headers: noStoreHeaders });
    let payload: unknown;
    try { payload = JSON.parse(text) as unknown; } catch { payload = undefined; }
    if (!response.ok) return NextResponse.json({ message: safeErrorMessage(payload, response.status) }, { status: response.status, headers: noStoreHeaders });
    const result = invitationResponse(payload);
    if (!result) return NextResponse.json({ message: "Invitation service response was invalid" }, { status: 502, headers: noStoreHeaders });
    return NextResponse.json(result, { status: 202, headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ message: "Invitation service is unavailable" }, { status: 503, headers: noStoreHeaders });
  }
}
