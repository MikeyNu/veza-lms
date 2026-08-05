import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { approveCurriculum } from "../../../../../../src/server/catalogue-api";

const noStore = { "cache-control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; versionId: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin curriculum approval is not allowed." }, { status: 403, headers: noStore });
  }
  try {
    const { kind, versionId } = await params;
    if ((kind !== "programmes" && kind !== "blueprints") || !uuid.test(versionId)) {
      return NextResponse.json({ message: "Curriculum approval target is invalid." }, { status: 400, headers: noStore });
    }
    const body = await request.json() as Record<string, unknown>;
    const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
    if (!uuid.test(institutionId)) return NextResponse.json({ message: "Institution identifier is invalid." }, { status: 400, headers: noStore });
    const { institutionId: _, ...input } = body;
    return NextResponse.json(await approveCurriculum(institutionId, kind, versionId, input), { headers: noStore });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Curriculum approval failed." }, { status: 400, headers: noStore });
  }
}
