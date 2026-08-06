import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { changePeopleBulkStatus } from "../../../../src/server/people-bulk-api";

const noStore = { "cache-control": "no-store" };
const maximumBytes = 64 * 1024;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin people changes are not allowed." }, { status: 403, headers: noStore });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "Bulk people requests must use application/json." }, { status: 415, headers: noStore });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > maximumBytes) {
    return NextResponse.json({ message: "Bulk people request is too large." }, { status: 413, headers: noStore });
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) {
      return NextResponse.json({ message: "Bulk people request is too large." }, { status: 413, headers: noStore });
    }
    const result = await changePeopleBulkStatus(JSON.parse(text));
    return NextResponse.json(result, { status: 200, headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Bulk people operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
