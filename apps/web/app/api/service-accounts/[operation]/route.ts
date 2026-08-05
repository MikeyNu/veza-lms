import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateServiceAccount } from "../../../../src/server/service-account-api";

const noStore = { "cache-control": "no-store" };
const allowed = [
  /^create$/,
  /^rotate:[0-9a-f-]{36}$/i,
  /^status:[0-9a-f-]{36}$/i,
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin service account changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { operation } = await params;
    if (!allowed.some((pattern) => pattern.test(operation))) {
      return NextResponse.json(
        { message: "Service account operation is invalid." },
        { status: 404, headers: noStore },
      );
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 64_000) {
      return NextResponse.json(
        { message: "Service account request is too large." },
        { status: 413, headers: noStore },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await mutateServiceAccount(operation, body), {
      headers: noStore,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Service account operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
