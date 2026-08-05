import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateCatalogue } from "../../../../src/server/catalogue-api";

const noStore = { "cache-control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operations = new Set(["outcomes", "programmes", "blueprints", "runs", "cohorts", "classes", "enrolments"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin catalogue changes are not allowed." }, { status: 403, headers: noStore });
  }
  try {
    const { operation } = await params;
    if (!operations.has(operation)) return NextResponse.json({ message: "Catalogue operation is invalid." }, { status: 404, headers: noStore });
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 2_000_000) return NextResponse.json({ message: "Catalogue request is too large." }, { status: 413, headers: noStore });
    const body = await request.json() as Record<string, unknown>;
    const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
    if (!uuid.test(institutionId)) return NextResponse.json({ message: "Institution identifier is invalid." }, { status: 400, headers: noStore });
    const { institutionId: _, ...input } = body;
    return NextResponse.json(await mutateCatalogue(institutionId, operation, input), { status: 201, headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Catalogue operation failed." }, { status: 400, headers: noStore });
  }
}
