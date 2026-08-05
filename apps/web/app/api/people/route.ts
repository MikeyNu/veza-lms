import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { createPerson } from "../../../src/server/people-api";

const noStore = { "cache-control": "no-store" };
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Cross-origin people changes are not allowed." }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "People requests must use application/json." }, { status: 415, headers: noStore });
  const declared = Number(request.headers.get("content-length") ?? "0"); if (!Number.isFinite(declared) || declared > 64 * 1024) return NextResponse.json({ message: "People request is too large." }, { status: 413, headers: noStore });
  try { const text = await request.text(); if (new TextEncoder().encode(text).byteLength > 64 * 1024) return NextResponse.json({ message: "People request is too large." }, { status: 413, headers: noStore }); const payload = JSON.parse(text); const result = await createPerson(payload); return NextResponse.json(result, { status: 201, headers: noStore }); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Person could not be created." }, { status: 400, headers: noStore }); }
}
