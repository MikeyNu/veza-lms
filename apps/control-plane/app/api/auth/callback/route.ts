import { completeAuthorization } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  controlPlaneOidcConfig,
  operatorSessionCookieName,
  operatorTransactionCookieName,
  secureCookie,
} from "../../../../src/server/auth-config";
import { loadOperatorPrincipal } from "../../../../src/server/operator-api";

function failed(request: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(reason)}`, request.url));
  response.cookies.set(operatorTransactionCookieName, "", { maxAge: 0, path: "/api/auth/callback" });
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("error")) return failed(request, "provider_error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const transactionCookie = request.cookies.get(operatorTransactionCookieName)?.value;
  if (!code || !state || !transactionCookie) return failed(request, "invalid_callback");

  try {
    const completed = await completeAuthorization(controlPlaneOidcConfig(), { code, state, transactionCookie });
    const principal = await loadOperatorPrincipal(completed.session.accessToken);
    if (!principal) return failed(request, "operator_access_required");

    const response = NextResponse.redirect(new URL(completed.returnTo, request.url));
    response.cookies.set(operatorSessionCookieName, completed.sessionCookie, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "strict",
      maxAge: Math.max(60, Math.floor((completed.session.expiresAt - Date.now()) / 1000)),
      path: "/",
    });
    response.cookies.set(operatorTransactionCookieName, "", { maxAge: 0, path: "/api/auth/callback" });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    return failed(request, "authentication_failed");
  }
}
