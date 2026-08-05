import { NextResponse, type NextRequest } from "next/server";
import { loadPeopleImportRows } from "../../../../../../src/server/people-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { importId } = await params;
    const institutionId = request.nextUrl.searchParams.get("institutionId");
    if (!uuid.test(importId) || !institutionId || !uuid.test(institutionId)) {
      return NextResponse.json(
        { message: "Import and institution identifiers are required." },
        { status: 400, headers: noStore },
      );
    }
    return NextResponse.json(await loadPeopleImportRows(institutionId, importId), {
      headers: noStore,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "People import rows could not be loaded.",
      },
      { status: 400, headers: noStore },
    );
  }
}
