import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { mutateLearner } from "../../../../src/server/learning-platform-api";

const noStore = { "cache-control": "no-store" };
const operations = new Set(["evidence","bookmark","discussion","offline","sync"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ operation: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Cross-origin learner changes are not allowed." }, { status: 403, headers: noStore });
  try {
    const { operation } = await params;
    if (!operations.has(operation)) return NextResponse.json({ message: "Learner operation is invalid." }, { status: 404, headers: noStore });
    const body = await request.json() as Record<string, unknown>;
    const enrolmentId = typeof body.enrolmentId === "string" ? body.enrolmentId : "";
    if (!uuid.test(enrolmentId)) return NextResponse.json({ message: "Enrolment identifier is invalid." }, { status: 400, headers: noStore });
    const { enrolmentId: _, ...input } = body;
    return NextResponse.json(await mutateLearner(enrolmentId, operation, input), { status: 200, headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Learner operation failed." }, { status: 400, headers: noStore });
  }
}
