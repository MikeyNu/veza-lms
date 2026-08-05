import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateReleaseCompletion } from "../../../../src/server/commercial-release-api";
import { getOperatorSession } from "../../../../src/server/operator-session";

const noStore = { "cache-control": "no-store" };
const allowed = [
  /^version:create$/,
  /^version:[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?:transition$/,
  /^target:create$/,
  /^target:[0-9a-f-]{36}:transition$/i,
  /^exception:set$/,
  /^compatibility:record$/,
  /^migration:update$/,
  /^rollback:create$/,
];

export async function POST(request: NextRequest, { params }: { params: Promise<{ operation: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin release changes are not allowed." }, { status: 403, headers: noStore });
  }
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ message: "Platform operator authentication is required." }, { status: 401, headers: noStore });
  try {
    const { operation } = await params;
    if (!allowed.some((pattern) => pattern.test(operation))) {
      return NextResponse.json({ message: "Release operation is invalid." }, { status: 404, headers: noStore });
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 512_000) {
      return NextResponse.json({ message: "Release request is too large." }, { status: 413, headers: noStore });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const supplied = request.headers.get("idempotency-key")?.trim();
    const idempotencyKey = supplied && /^[A-Za-z0-9._:-]{16,128}$/.test(supplied) ? supplied : `release-${randomUUID()}`;
    return NextResponse.json(await mutateReleaseCompletion(session.oidc.accessToken, operation, body, idempotencyKey), { headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Release operation failed." }, { status: 400, headers: noStore });
  }
}
