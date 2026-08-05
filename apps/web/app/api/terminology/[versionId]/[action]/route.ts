import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { transitionTerminologyVersion } from "../../../../../src/server/terminology-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string; action: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin terminology changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { versionId, action } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = body.institutionId;
    if (
      !uuid.test(versionId) ||
      (action !== "submit" && action !== "approve") ||
      typeof institutionId !== "string" ||
      !uuid.test(institutionId)
    ) {
      return NextResponse.json(
        { message: "Terminology transition is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const { institutionId: _, ...input } = body;
    return NextResponse.json(
      await transitionTerminologyVersion(
        institutionId,
        versionId,
        action,
        input,
      ),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Terminology transition could not be completed.",
      },
      { status: 400, headers: noStore },
    );
  }
}
