import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { governCatalogue } from "../../../../../../../src/server/catalogue-api";

const noStore = { "cache-control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const combinations = new Set([
  "programme-versions:courses",
  "blueprint-versions:requisites",
  "runs:lifecycle",
  "enrolments:status",
  "classes:staff",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string; resourceId: string; action: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin academic operations are not allowed." }, { status: 403, headers: noStore });
  }
  try {
    const { resource, resourceId, action } = await params;
    if (!uuid.test(resourceId) || !combinations.has(`${resource}:${action}`)) {
      return NextResponse.json({ message: "Academic governance operation is invalid." }, { status: 400, headers: noStore });
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 64_000) {
      return NextResponse.json({ message: "Academic governance request is too large." }, { status: 413, headers: noStore });
    }
    const body = await request.json() as Record<string, unknown>;
    const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
    if (!uuid.test(institutionId)) {
      return NextResponse.json({ message: "Institution identifier is invalid." }, { status: 400, headers: noStore });
    }
    const { institutionId: _, ...input } = body;
    return NextResponse.json(
      await governCatalogue(
        institutionId,
        resource as "programme-versions" | "blueprint-versions" | "runs" | "enrolments" | "classes",
        resourceId,
        action as "courses" | "requisites" | "lifecycle" | "status" | "staff",
        input,
      ),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Academic governance operation failed." },
      { status: 400, headers: noStore },
    );
  }
}
