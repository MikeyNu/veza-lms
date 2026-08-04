import { createAuthorizationRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  secureCookie,
  webOidcConfig,
  webTransactionCookieName,
} from "../../../../src/server/auth-config";

export function GET(request: NextRequest) {
  const { authorizationUrl, transactionCookie } = createAuthorizationRequest(webOidcConfig(), {
    returnTo: request.nextUrl.searchParams.get("returnTo"),
    loginHint: request.nextUrl.searchParams.get("email"),
  });
  const response = NextResponse.redirect(authorizationUrl);
  response.headers.set("cache-control", "no-store");
  response.cookies.set(webTransactionCookieName, transactionCookie, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/callback",
  });
  return response;
}
