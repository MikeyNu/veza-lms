import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateObservability } from "../../../../src/server/observability-api";
import { getOperatorSession } from "../../../../src/server/operator-session";

const noStore = { "cache-control": "no-store" };
const allowed = [
  /^slo-create$/,
  /^rule-create$/,
  /^slo-status:[0-9a-f-]{36}$/i,
  /^rule-status:[0-9a-f-]{36}$/i,
  /^alert-state:[0-9a-f-]{36}$/i,
  /^error-state:[0-9a-f-]{36}$/i,
  /^runtime-status:[a-z][a-z0-9.-]{2,119}$/,
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin observability changes are not allowed." },
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
        { message: "Observability operation is invalid." },
        { status: 404, headers: noStore },
      );
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 128_000) {
      return NextResponse.json(
        { message: "Observability request is too large." },
        { status: 413, headers: noStore },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      await mutateObservability(session.oidc.accessToken, operation, body),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Observability operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
