import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { transitionRelationship } from "../../../../../../../src/server/people-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ relationshipId: string; action: string }>;
  },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin relationship changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { relationshipId, action } = await params;
    if (!uuid.test(relationshipId) || (action !== "verify" && action !== "revoke")) {
      return NextResponse.json(
        { message: "Relationship action is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = body.institutionId;
    if (typeof institutionId !== "string" || !uuid.test(institutionId)) {
      return NextResponse.json(
        { message: "Institution identifier is required." },
        { status: 400, headers: noStore },
      );
    }
    const transition = { ...body };
    delete transition.institutionId;
    return NextResponse.json(
      await transitionRelationship(
        relationshipId,
        institutionId,
        action,
        transition,
      ),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Relationship could not be changed.",
      },
      { status: 400, headers: noStore },
    );
  }
}
