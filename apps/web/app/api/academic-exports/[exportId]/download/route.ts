import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { membershipCookieName } from "../../../../../src/server/auth-config";
import { getWebOidcSession } from "../../../../../src/server/web-session";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const noStore = { "cache-control": "private, no-store" };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const [{ exportId }, session, cookieStore] = await Promise.all([
    params,
    getWebOidcSession(),
    cookies(),
  ]);
  if (!uuid.test(exportId)) {
    return NextResponse.json({ message: "Export identifier is invalid." }, { status: 400, headers: noStore });
  }
  const membershipId = cookieStore.get(membershipCookieName)?.value;
  if (!session || !membershipId || !uuid.test(membershipId)) {
    return NextResponse.json({ message: "An active workspace session is required." }, { status: 401, headers: noStore });
  }

  const upstream = await fetch(
    `${apiBaseUrl}/v1/academic-evidence/exports/${exportId}/download`,
    {
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "x-veza-membership-id": membershipId,
        accept: "application/pdf,text/csv,application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!upstream.ok) {
    const text = (await upstream.text()).slice(0, 8_000);
    let message = "Export download failed.";
    try {
      const body = JSON.parse(text) as { message?: unknown; detail?: unknown };
      if (typeof body.message === "string") message = body.message;
      else if (typeof body.detail === "string") message = body.detail;
    } catch {
      if (text) message = text.slice(0, 400);
    }
    return NextResponse.json({ message }, { status: upstream.status, headers: noStore });
  }

  const headers = new Headers(noStore);
  for (const name of ["content-type", "content-disposition", "content-length", "x-veza-checksum-sha256"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-content-type-options", "nosniff");
  return new NextResponse(upstream.body, { status: 200, headers });
}
