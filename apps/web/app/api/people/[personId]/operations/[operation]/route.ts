import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { createPersonOperation } from "@/src/server/people-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operations = new Set([
  "contacts",
  "addresses",
  "identifiers",
  "organisational-assignments",
  "staff-engagements",
  "consents",
  "disclosure-restrictions",
  "identity-invitations",
  "identity-links",
  "relationship-invitations",
  "data-subject-requests",
]);
const noStore = { "cache-control": "no-store" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ personId: string; operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin people changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { personId, operation } = await params;
    if (!uuid.test(personId) || !operations.has(operation)) {
      return NextResponse.json(
        { message: "People operation is invalid." },
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
    const { institutionId: _, ...input } = body;
    const result = await createPersonOperation(
      institutionId,
      personId,
      operation,
      input,
    );
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "People operation could not be completed.",
      },
      { status: 400, headers: noStore },
    );
  }
}
