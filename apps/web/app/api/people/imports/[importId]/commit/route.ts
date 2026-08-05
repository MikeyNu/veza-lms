import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { commitPeopleImport } from "../../../../../../src/server/people-api";

const noStore = { "cache-control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, { params }: { params: Promise<{ importId: string }> }) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Cross-origin import commits are not allowed." }, { status: 403, headers: noStore });
  const { importId } = await params; if (!uuid.test(importId)) return NextResponse.json({ message: "Import identifier is invalid." }, { status: 400, headers: noStore });
  try { const payload = await request.json() as { reason?: unknown }; if (typeof payload.reason !== "string" || payload.reason.trim().length < 20 || payload.reason.length > 500) return NextResponse.json({ message: "A 20-500 character reconciliation reason is required." }, { status: 400, headers: noStore }); const result = await commitPeopleImport(importId, payload.reason); return NextResponse.json(result, { headers: noStore }); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Import could not be committed." }, { status: 400, headers: noStore }); }
}
