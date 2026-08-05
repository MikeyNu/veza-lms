import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { getOperatorSession } from "../../../../../src/server/operator-session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Cross-origin requeue is not allowed." }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "Requeue requests must use application/json." }, { status: 415, headers: noStore });
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ message: "Platform operator session is required." }, { status: 401, headers: noStore });
  const { eventId } = await params;
  if (!uuidPattern.test(eventId)) return NextResponse.json({ message: "Event identifier is invalid." }, { status: 400, headers: noStore });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) return NextResponse.json({ message: "A valid idempotency key is required." }, { status: 400, headers: noStore });
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > 8 * 1024) return NextResponse.json({ message: "Requeue request is too large." }, { status: 413, headers: noStore });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 8 * 1024) return NextResponse.json({ message: "Requeue request is too large." }, { status: 413, headers: noStore });
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; } catch { return NextResponse.json({ message: "Requeue request is invalid JSON." }, { status: 400, headers: noStore }); }
  if (!record(payload) || typeof payload.reason !== "string" || payload.reason.trim().length < 20 || payload.reason.length > 500 || Object.keys(payload).some((key) => key !== "reason")) return NextResponse.json({ message: "A 20-500 character operational reason is required." }, { status: 400, headers: noStore });
  try {
    const upstream = await fetch(`${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/outbox-dead-letters/${eventId}/requeue`, {
      method: "POST", headers: { authorization: `Bearer ${session.oidc.accessToken}`, "content-type": "application/json", "idempotency-key": idempotencyKey, "x-correlation-id": randomUUID() }, body: JSON.stringify({ reason: payload.reason }), cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    const responseLength = Number(upstream.headers.get("content-length") ?? "0");
    if (Number.isFinite(responseLength) && responseLength > 64 * 1024) return NextResponse.json({ message: "Requeue service response was invalid." }, { status: 502, headers: noStore });
    const body = await upstream.text();
    if (new TextEncoder().encode(body).byteLength > 64 * 1024) return NextResponse.json({ message: "Requeue service response was invalid." }, { status: 502, headers: noStore });
    let result: unknown;
    try { result = JSON.parse(body) as unknown; } catch { return NextResponse.json({ message: "Requeue service response was invalid." }, { status: 502, headers: noStore }); }
    if (!upstream.ok) {
      const message = record(result) && typeof result.message === "string" && result.message.length <= 240 ? result.message : "Delivery could not be requeued.";
      return NextResponse.json({ message }, { status: upstream.status, headers: noStore });
    }
    if (!record(result) || result.eventId !== eventId || result.state !== "queued" || typeof result.queuedAt !== "string" || !Number.isFinite(Date.parse(result.queuedAt)) || typeof result.previousAttempts !== "number" || !Number.isInteger(result.previousAttempts)) return NextResponse.json({ message: "Requeue service response did not match the contract." }, { status: 502, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch { return NextResponse.json({ message: "Requeue service is unavailable." }, { status: 503, headers: noStore }); }
}
