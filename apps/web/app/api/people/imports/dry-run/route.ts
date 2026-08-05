import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { dryRunPeopleImport } from "../../../../../src/server/people-api";

const noStore = { "cache-control": "no-store" };
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Cross-origin imports are not allowed." }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "Import requests must use application/json." }, { status: 415, headers: noStore });
  const declared = Number(request.headers.get("content-length") ?? "0"); if (!Number.isFinite(declared) || declared > 2_100_000) return NextResponse.json({ message: "Import file is too large." }, { status: 413, headers: noStore });
  try { const text = await request.text(); if (new TextEncoder().encode(text).byteLength > 2_100_000) return NextResponse.json({ message: "Import file is too large." }, { status: 413, headers: noStore }); const result = await dryRunPeopleImport(JSON.parse(text)); return NextResponse.json(result, { headers: noStore }); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Import could not be validated." }, { status: 400, headers: noStore }); }
}
