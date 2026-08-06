import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateAccessDirectory } from "../../../../src/server/access-directory-api";

const allowed = new Set([
  "invite",
  "membership-status",
  "role-assign",
  "role-end",
  "invitation-revoke",
  "invitation-resend",
  "invitations-bulk-revoke",
]);
const noStore = { "cache-control": "no-store" };
const maximumBytes = 64 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ operation: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin access changes are not allowed." }, { status: 403, headers: noStore });
  }
  const { operation } = await params;
  if (!allowed.has(operation)) return NextResponse.json({ message: "Access operation is invalid." }, { status: 404, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "Access requests must use application/json." }, { status: 415, headers: noStore });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > maximumBytes) return NextResponse.json({ message: "Access request is too large." }, { status: 413, headers: noStore });
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) return NextResponse.json({ message: "Access request is too large." }, { status: 413, headers: noStore });
    return NextResponse.json(await mutateAccessDirectory(operation, JSON.parse(text)), { status: 200, headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Access operation failed." }, { status: 400, headers: noStore });
  }
}
