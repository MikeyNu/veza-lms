import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateAcademic } from "../../../../src/server/learning-platform-api";

const noStore = { "cache-control": "no-store" };
const operations = new Set([
  "assignment-create",
  "assignment-publish",
  "accommodation",
  "rubric-create",
  "rubric-submit",
  "rubric-approve",
  "rubric-attach",
  "assignment-group-create",
  "assignment-group-members",
  "submission-start",
  "submission-file",
  "submission-offset",
  "submission-finalize",
  "marker-allocate",
  "mark-record",
  "mark-release",
  "grade-category",
  "grade-item",
  "formula-create",
  "formula-activate",
  "grade-override",
  "grade-publish",
  "certificate-template",
  "certificate-template-submit",
  "certificate-template-approve",
  "award-rule",
  "award-evaluate",
  "certificate-issue",
  "certificate-revoke",
  "export",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin academic changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { operation } = await params;
    if (!operations.has(operation)) {
      return NextResponse.json(
        { message: "Academic operation is invalid." },
        { status: 404, headers: noStore },
      );
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 4_500_000) {
      return NextResponse.json(
        { message: "Academic request is too large." },
        { status: 413, headers: noStore },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await mutateAcademic(operation, body), {
      status: 200,
      headers: noStore,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Academic operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
