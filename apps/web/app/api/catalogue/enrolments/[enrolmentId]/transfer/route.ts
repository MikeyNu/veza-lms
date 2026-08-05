import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { transferEnrolment } from "../../../../../../src/server/catalogue-api";

const noStore = { "cache-control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ enrolmentId: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin enrolment transfer is not allowed." }, { status: 403, headers: noStore });
  }
  try {
    const { enrolmentId } = await params;
    if (!uuid.test(enrolmentId)) return NextResponse.json({ message: "Enrolment identifier is invalid." }, { status: 400, headers: noStore });
    const body = await request.json() as Record<string, unknown>;
    const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
    if (!uuid.test(institutionId)) return NextResponse.json({ message: "Institution identifier is invalid." }, { status: 400, headers: noStore });
    const { institutionId: _, ...input } = body;
    return NextResponse.json(await transferEnrolment(institutionId, enrolmentId, input), { headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Enrolment transfer failed." }, { status: 400, headers: noStore });
  }
}
