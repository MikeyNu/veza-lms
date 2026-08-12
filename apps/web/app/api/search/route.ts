import { NextResponse, type NextRequest } from "next/server";
import { demoModeEnabled } from "../../../src/server/demo-mode";
import { demoFixtureIds } from "../../../src/server/demo-workspace-data";
import { getWebOidcSession } from "../../../src/server/web-session";

const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const noStore = { "cache-control": "no-store" };

function demoSearch(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
  const requestedTypes = new Set(
    (request.nextUrl.searchParams.get("types") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const catalogue = [
    {
      id: demoFixtureIds.demoLearnerPersonId,
      entityType: "person",
      title: "Naledi Mokoena",
      subtitle: "Learner · AKH-L-2026-0142",
      excerpt: "Active learner at Sgela Academy",
      metadata: { href: `/people/${demoFixtureIds.demoLearnerPersonId}` },
    },
    {
      id: demoFixtureIds.courseRunId,
      entityType: "course-run",
      title: "Data Literacy Foundations",
      subtitle: "DL101-S2-26 · In progress",
      excerpt: "Blended course run for Semester 2 2026",
      metadata: { href: "/learning" },
    },
    {
      id: demoFixtureIds.lessonId,
      entityType: "studio-lesson",
      title: "Reading a dataset critically",
      subtitle: "Data Literacy Foundations",
      excerpt: "Separate observation, interpretation and claim.",
      metadata: { href: `/studio/lessons/${demoFixtureIds.lessonId}` },
    },
    {
      id: "00000000-0000-4000-8000-000000006701",
      entityType: "media-asset",
      title: "Source evaluation guide",
      subtitle: "PDF · Learning content",
      excerpt: "Four-page reference guide for evaluating evidence sources.",
      metadata: { href: "/studio" },
    },
  ];
  const items = catalogue.filter((item) => {
    if (requestedTypes.size > 0 && !requestedTypes.has(item.entityType)) return false;
    if (!query) return true;
    return `${item.title} ${item.subtitle} ${item.excerpt}`.toLowerCase().includes(query);
  });
  return NextResponse.json({ items, latencyMs: 1 }, { headers: noStore });
}

export async function GET(request: NextRequest) {
  try {
    if (demoModeEnabled()) return demoSearch(request);
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
