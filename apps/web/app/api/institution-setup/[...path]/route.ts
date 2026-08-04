import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import { membershipCookieName } from "../../../../src/server/auth-config";
import { getWebOidcSession } from "../../../../src/server/web-session";

const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const routes: readonly Readonly<{ pattern: RegExp; method: "POST" | "PUT" }>[] = [
  { pattern: /^profile$/, method: "PUT" },
  { pattern: /^institutions$/, method: "POST" },
  { pattern: new RegExp(`^institutions/${uuid}/campuses$`), method: "POST" },
  { pattern: new RegExp(`^institutions/${uuid}/organisational-units$`), method: "POST" },
  { pattern: new RegExp(`^institutions/${uuid}/academic-periods$`), method: "POST" },
  { pattern: new RegExp(`^institutions/${uuid}/academic-periods/${uuid}/publish$`), method: "POST" },
  { pattern: new RegExp(`^institutions/${uuid}/policies/approve$`), method: "POST" },
  { pattern: /^activate$/, method: "POST" },
];
const maximumRequestBytes = 128 * 1024;
const maximumResponseBytes = 512 * 1024;
const noStore = { "cache-control": "no-store" };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function containsSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, item]) => /^(?:accessToken|refreshToken|idToken|clientSecret|authorization)$/i.test(key) || containsSecretKey(item));
}
function apiBaseUrl(): string { return process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"; }

async function proxy(request: NextRequest, method: "POST" | "PUT", parameters: Promise<{ path: string[] }>) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) return NextResponse.json({ message: "Request origin could not be verified" }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "JSON request body is required" }, { status: 415, headers: noStore });
  const { path } = await parameters;
  const joined = path.join("/");
  if (path.length > 6 || !routes.some((route) => route.method === method && route.pattern.test(joined))) return NextResponse.json({ message: "Institution setup operation is not available" }, { status: 404, headers: noStore });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength > maximumRequestBytes) return NextResponse.json({ message: "Request body is too large" }, { status: 413, headers: noStore });

  const [session, membershipId] = await Promise.all([getWebOidcSession(), Promise.resolve(request.cookies.get(membershipCookieName)?.value)]);
  if (!session || !membershipId || !new RegExp(`^${uuid}$`).test(membershipId)) return NextResponse.json({ message: "An active workspace session is required" }, { status: 401, headers: noStore });

  const body = await request.text();
  if (body.length > maximumRequestBytes) return NextResponse.json({ message: "Request body is too large" }, { status: 413, headers: noStore });
  let input: unknown;
  try { input = JSON.parse(body) as unknown; } catch { return NextResponse.json({ message: "Request body is invalid" }, { status: 400, headers: noStore }); }
  if (!isRecord(input) || containsSecretKey(input)) return NextResponse.json({ message: "Request body contains an unsupported value" }, { status: 400, headers: noStore });

  try {
    const upstream = await fetch(`${apiBaseUrl()}/v1/institution-setup/${joined}`, {
      method,
      headers: { authorization: `Bearer ${session.accessToken}`, "x-veza-membership-id": membershipId, "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await upstream.text();
    if (text.length > maximumResponseBytes) return NextResponse.json({ message: "Institution setup response was invalid" }, { status: 502, headers: noStore });
    let payload: unknown;
    try { payload = JSON.parse(text) as unknown; } catch { return NextResponse.json({ message: "Institution setup response was invalid" }, { status: 502, headers: noStore }); }
    if (containsSecretKey(payload)) return NextResponse.json({ message: "Institution setup response was rejected" }, { status: 502, headers: noStore });
    if (!upstream.ok) {
      const message = isRecord(payload) && (typeof payload.message === "string" || Array.isArray(payload.message)) ? payload.message : "Institution setup operation failed";
      return NextResponse.json({ message }, { status: upstream.status, headers: noStore });
    }
    if (!isRecord(payload)) return NextResponse.json({ message: "Institution setup response did not match the contract" }, { status: 502, headers: noStore });
    return NextResponse.json(payload, { status: upstream.status, headers: noStore });
  } catch {
    return NextResponse.json({ message: "Institution setup service is unavailable" }, { status: 503, headers: noStore });
  }
}

export function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return proxy(request, "POST", context.params); }
export function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return proxy(request, "PUT", context.params); }
