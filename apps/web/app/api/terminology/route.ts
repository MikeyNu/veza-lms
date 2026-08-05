import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { createTerminologyVersion } from "../../../src/server/terminology-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin terminology changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = body.institutionId;
    if (typeof institutionId !== "string" || !uuid.test(institutionId)) {
      return NextResponse.json(
        { message: "Institution identifier is required." },
        { status: 400, headers: noStore },
      );
    }
    const { institutionId: _, ...input } = body;
    return NextResponse.json(
      await createTerminologyVersion(institutionId, input),
      { status: 201, headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Terminology version could not be created.",
      },
      { status: 400, headers: noStore },
    );
  }
}
