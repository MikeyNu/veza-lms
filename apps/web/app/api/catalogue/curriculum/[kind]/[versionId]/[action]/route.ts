import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  analyseCurriculum,
  approveCurriculum,
  loadCurriculumHistory,
  submitCurriculum,
} from "../../../../../../../src/server/catalogue-api";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "cache-control": "no-store" };

function validKind(value: string): value is "programmes" | "blueprints" {
  return value === "programmes" || value === "blueprints";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; versionId: string; action: string }> },
) {
  try {
    const { kind, versionId, action } = await params;
    const institutionId = request.nextUrl.searchParams.get("institutionId");
    if (
      !validKind(kind) ||
      !uuid.test(versionId) ||
      action !== "history" ||
      !institutionId ||
      !uuid.test(institutionId)
    ) {
      return NextResponse.json(
        { message: "Curriculum history request is invalid." },
        { status: 400, headers: noStore },
      );
    }
    return NextResponse.json(
      await loadCurriculumHistory(institutionId, kind, versionId),
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Curriculum history could not be loaded.",
      },
      { status: 400, headers: noStore },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; versionId: string; action: string }> },
) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin curriculum changes are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  try {
    const { kind, versionId, action } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const institutionId = body.institutionId;
    if (
      !validKind(kind) ||
      !uuid.test(versionId) ||
      !["analysis", "submit", "approve"].includes(action) ||
      typeof institutionId !== "string" ||
      !uuid.test(institutionId)
    ) {
      return NextResponse.json(
        { message: "Curriculum lifecycle request is invalid." },
        { status: 400, headers: noStore },
      );
    }
    const { institutionId: _, ...input } = body;
    const result =
      action === "analysis"
        ? await analyseCurriculum(institutionId, kind, versionId)
        : action === "submit"
          ? await submitCurriculum(
              institutionId,
              kind,
              versionId,
              Number(input.expectedVersion),
            )
          : await approveCurriculum(institutionId, kind, versionId, input);
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Curriculum lifecycle operation could not be completed.",
      },
      { status: 400, headers: noStore },
    );
  }
}
