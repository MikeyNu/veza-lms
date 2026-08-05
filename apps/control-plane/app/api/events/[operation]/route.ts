import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateEventPlatform } from "../../../../src/server/event-platform-api";
import { requireOperatorSession } from "../../../../src/server/operator-session";

const noStore = { "cache-control": "no-store" };
const allowed = [
  /^schema-create$/,
  /^consumer-create$/,
  /^schedule-create$/,
  /^schema-submit:[0-9a-f-]{36}$/i,
  /^schema-approve:[0-9a-f-]{36}$/i,
  /^replay:[0-9a-f-]{36}$/i,
  /^consumer-status:[a-z0-9.-]{3,120}$/i,
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin event operations are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { operation } = await params;
    if (!allowed.some((pattern) => pattern.test(operation))) {
      return NextResponse.json(
        { message: "Event operation is invalid." },
        { status: 404, headers: noStore },
      );
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 300_000) {
      return NextResponse.json(
        { message: "Event operation request is too large." },
        { status: 413, headers: noStore },
      );
    }
    const session = await requireOperatorSession();
    const input = (await request.json()) as Record<string, unknown>;
    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const result = await mutateEventPlatform(
      session.oidc.accessToken,
      operation,
      input,
      idempotencyKey,
    );
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Event operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
