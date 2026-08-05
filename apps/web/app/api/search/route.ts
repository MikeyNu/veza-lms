import { NextResponse, type NextRequest } from "next/server";
import { getWebOidcSession } from "../../../src/server/web-session";

const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const noStore = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    const session = await getWebOidcSession();
    if (!session) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401, headers: noStore });
    }
    const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
    const types = request.nextUrl.searchParams.get("types")?.trim();
    const institutionId = request.nextUrl.searchParams.get("institutionId")?.trim();
    const cursor = request.nextUrl.searchParams.get("cursor")?.trim();
    const limit = Math.max(1, Math.min(30, Number(request.nextUrl.searchParams.get("limit") ?? 12)));
    if (query.length > 500) {
      return NextResponse.json({ message: "Search query is too long." }, { status: 400, headers: noStore });
    }
    const params = new URLSearchParams({ query, limit: String(limit) });
    if (types) params.set("entityTypes", types);
    if (institutionId) params.set("institutionId", institutionId);
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${apiBaseUrl}/v1/search?${params}`, {
      headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (text.length > 512 * 1024) {
      return NextResponse.json({ message: "Search response is too large." }, { status: 502, headers: noStore });
    }
    return new NextResponse(text, {
      status: response.status,
      headers: { ...noStore, "content-type": "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Search failed." },
      { status: 500, headers: noStore },
    );
  }
}
