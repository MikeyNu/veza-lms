import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { reconcilePeopleImportRow } from "../../../../../../../src/server/people-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string; rowId: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin import changes are not allowed." },
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
        { message: "Import reconciliation request is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const { institutionId: _, ...input } = body;
    return NextResponse.json(
      await reconcilePeopleImportRow(institutionId, importId, rowId, input),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "People import row could not be reconciled.",
      },
      { status: 400, headers: noStore },
    );
  }
}
