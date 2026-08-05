import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateControlPlaneOperations } from "../../../../src/server/control-plane-operations-api";
import { getOperatorSession } from "../../../../src/server/operator-session";

const noStore = { "cache-control": "no-store" };
const allowed = [
  /^tenant:[0-9a-f-]{36}:(profile|health|lifecycle|export|hold|deletion|entitlement|threshold|billing)$/i,
  /^export:[0-9a-f-]{36}:[0-9a-f-]{36}:complete$/i,
  /^hold:[0-9a-f-]{36}:[0-9a-f-]{36}:release$/i,
  /^deletion:[0-9a-f-]{36}:[0-9a-f-]{36}:cancel$/i,
  /^support:create$/,
  /^support:[0-9a-f-]{36}:(approval|elevation|resolve)$/i,
  /^session:[0-9a-f-]{36}:terminate$/i,
  /^incident:create$/,
  /^incident:[0-9a-f-]{36}:transition$/i,
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin control-plane changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  const session = await getOperatorSession();
  if (!session) {
    return NextResponse.json(
      { message: "Platform operator authentication is required." },
      { status: 401, headers: noStore },
    );
  }
  try {
    const { operation } = await params;
    if (!allowed.some((pattern) => pattern.test(operation))) {
      return NextResponse.json(
        { message: "Control-plane operation is invalid." },
        { status: 404, headers: noStore },
      );
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 256_000) {
      return NextResponse.json(
        { message: "Control-plane request is too large." },
        { status: 413, headers: noStore },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const supplied = request.headers.get("idempotency-key")?.trim();
    const idempotencyKey = supplied && /^[A-Za-z0-9._:-]{16,128}$/.test(supplied)
      ? supplied
      : `cp-${randomUUID()}`;
    return NextResponse.json(
      await mutateControlPlaneOperations(session.oidc.accessToken, operation, body, idempotencyKey),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Control-plane operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
