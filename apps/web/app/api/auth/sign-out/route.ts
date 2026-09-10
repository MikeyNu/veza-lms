import { isSameOriginRequest, secureReturnTo } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  membershipCookieName,
  returnToCookieName,
  webSessionCookieName,
  webTransactionCookieName,
} from "../../../../src/server/auth-config";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin sign-out is not allowed." }, { status: 403 });
  }

  const form = await request.formData().catch(() => undefined);
  const rawReturnTo = form?.get("returnTo");
  const returnTo = secureReturnTo(typeof rawReturnTo === "string" ? rawReturnTo : undefined);
  const destination = new URL("/sign-in", request.url);
  if (returnTo !== "/") destination.searchParams.set("returnTo", returnTo);

  const response = NextResponse.redirect(destination, 303);
  for (const name of [webSessionCookieName, membershipCookieName, returnToCookieName]) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  response.cookies.set(webTransactionCookieName, "", { maxAge: 0, path: "/api/auth/callback" });
  response.headers.set("cache-control", "no-store");
  return response;
}
