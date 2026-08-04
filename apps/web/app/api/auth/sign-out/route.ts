import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  membershipCookieName,
  returnToCookieName,
  webSessionCookieName,
  webTransactionCookieName,
} from "../../../../src/server/auth-config";

export function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin sign-out is not allowed." }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/sign-in", request.url), 303);
  for (const name of [webSessionCookieName, membershipCookieName, returnToCookieName]) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  response.cookies.set(webTransactionCookieName, "", { maxAge: 0, path: "/api/auth/callback" });
  response.headers.set("cache-control", "no-store");
  return response;
}
