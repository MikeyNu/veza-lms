import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateStudio } from "../../../../src/server/learning-platform-api";

const noStore = { "cache-control": "no-store" };
const operations = new Set([
  "course-space-create",
  "module-create",
  "lesson-create",
  "revision-save",
  "reusable-block-create",
  "asset-register",
  "asset-scan",
  "comment-create",
  "comment-status",
  "review-request",
  "review-decision",
  "course-publish",
  "import-analyse",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin Studio changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { operation } = await params;
    if (!operations.has(operation)) {
      return NextResponse.json(
        { message: "Studio operation is invalid." },
        { status: 404, headers: noStore },
      );
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 4_500_000) {
      return NextResponse.json(
        { message: "Studio request is too large." },
        { status: 413, headers: noStore },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
    if (!uuid.test(institutionId)) {
      return NextResponse.json(
        { message: "Institution identifier is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const { institutionId: _, ...input } = body;
    return NextResponse.json(await mutateStudio(institutionId, operation, input), {
      status: 200,
      headers: noStore,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Studio operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
