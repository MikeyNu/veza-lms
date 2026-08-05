import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { getOperatorSession } from "../../../../../src/server/operator-session";

const maximumRequestBytes = 4 * 1024;
const maximumResponseBytes = 32 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9._:-]{16,128}$/;
const sensitiveText = /\b(?:authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret)\b\s*[:=]|\bBearer\s+/i;
const noStoreHeaders = { "cache-control": "no-store", pragma: "no-cache" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upstreamError(status: number): string {
  if (status === 400) return "The operational reason did not meet recovery policy.";
  if (status === 401 || status === 403) return "The operator is not authorised to requeue this event.";
  if (status === 404) return "The event is no longer available in the recovery queue.";
  if (status === 409) return "The event state changed or this recovery is already being processed.";
  return "The delivery event could not be requeued.";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin recovery is not allowed." }, { status: 403, headers: noStoreHeaders });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "Recovery requests must use application/json." }, { status: 415, headers: noStoreHeaders });
  }

  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ message: "Platform operator session is required." }, { status: 401, headers: noStoreHeaders });

  const { eventId } = await params;
  if (!uuidPattern.test(eventId)) return NextResponse.json({ message: "Event identifier is invalid." }, { status: 400, headers: noStoreHeaders });
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !idempotencyPattern.test(idempotencyKey)) {
    return NextResponse.json({ message: "A valid operation key is required." }, { status: 400, headers: noStoreHeaders });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > maximumRequestBytes) {
    return NextResponse.json({ message: "Recovery request is too large." }, { status: 413, headers: noStoreHeaders });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumRequestBytes) {
    return NextResponse.json({ message: "Recovery request is too large." }, { status: 413, headers: noStoreHeaders });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ message: "Recovery request is invalid JSON." }, { status: 400, headers: noStoreHeaders });
  }
  if (!isRecord(payload) || Object.keys(payload).length !== 1 || typeof payload.reason !== "string") {
    return NextResponse.json({ message: "A specific operational reason is required." }, { status: 400, headers: noStoreHeaders });
  }
  const reason = payload.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 20 || reason.length > 500 || sensitiveText.test(reason)) {
    return NextResponse.json({ message: "Provide a 20-500 character reason without credentials, tokens or secrets." }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const upstream = await fetch(
      `${process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"}/v1/control-plane/outbox-dead-letters/${eventId}/requeue`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.oidc.accessToken}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-correlation-id": randomUUID(),
        },
        body: JSON.stringify({ reason }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    const responseLength = Number(upstream.headers.get("content-length") ?? "0");
    if (Number.isFinite(responseLength) && responseLength > maximumResponseBytes) {
      return NextResponse.json({ message: "Recovery service response was invalid." }, { status: 502, headers: noStoreHeaders });
    }
    const body = await upstream.text();
    if (new TextEncoder().encode(body).byteLength > maximumResponseBytes) {
      return NextResponse.json({ message: "Recovery service response was invalid." }, { status: 502, headers: noStoreHeaders });
    }

    let result: unknown;
    try {
      result = JSON.parse(body) as unknown;
    } catch {
      return NextResponse.json({ message: "Recovery service response was invalid." }, { status: 502, headers: noStoreHeaders });
    }
    if (!upstream.ok) {
      return NextResponse.json({ message: upstreamError(upstream.status) }, { status: upstream.status, headers: noStoreHeaders });
    }
    if (!isRecord(result)
      || result.eventId !== eventId
      || result.state !== "queued"
      || typeof result.queuedAt !== "string"
      || !Number.isFinite(Date.parse(result.queuedAt))
      || typeof result.previousAttempts !== "number"
      || !Number.isInteger(result.previousAttempts)
      || result.previousAttempts < 1) {
      return NextResponse.json({ message: "Recovery service response did not match the contract." }, { status: 502, headers: noStoreHeaders });
    }
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ message: "Recovery service is unavailable." }, { status: 503, headers: noStoreHeaders });
  }
}
