import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePeopleImportDuplicate } from "../../../../../../../../src/server/people-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string; rowId: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin duplicate decisions are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { importId, rowId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = body.institutionId;
    if (
      !uuid.test(importId) ||
      !uuid.test(rowId) ||
      typeof institutionId !== "string" ||
      !uuid.test(institutionId)
    ) {
      return NextResponse.json(
        { message: "Duplicate-resolution request is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const { institutionId: _, ...input } = body;
    return NextResponse.json(
      await resolvePeopleImportDuplicate(institutionId, importId, rowId, input),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Duplicate import row could not be resolved.",
      },
      { status: 400, headers: noStore },
    );
  }
}
