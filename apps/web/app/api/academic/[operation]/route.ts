import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateAcademic } from "../../../../src/server/learning-platform-api";

const noStore = { "cache-control": "no-store" };
const operations = new Set(["assignment-create","assignment-publish","accommodation","submission-start","submission-file","submission-offset","submission-finalize","marker-allocate","mark-record","grade-category","grade-item","formula-create","formula-activate","grade-override","grade-publish","certificate-template","award-rule","certificate-issue","certificate-revoke","export"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ operation: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Cross-origin academic changes are not allowed." }, { status: 403, headers: noStore });
  try {
    const { operation } = await params;
    if (!operations.has(operation)) return NextResponse.json({ message: "Academic operation is invalid." }, { status: 404, headers: noStore });
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await mutateAcademic(operation, body), { status: 200, headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Academic operation failed." }, { status: 400, headers: noStore });
  }
}
