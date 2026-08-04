import { completeAuthorization } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  membershipCookieName,
  returnToCookieName,
  secureCookie,
  webOidcConfig,
  webSessionCookieName,
  webTransactionCookieName,
} from "../../../../src/server/auth-config";
import { listWorkspaceOptions } from "../../../../src/server/workspace-api";

function failed(request: NextRequest, reason: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(reason)}`, request.url));
  response.cookies.set(webTransactionCookieName, "", { maxAge: 0, path: "/api/auth/callback" });
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("error")) return failed(request, "provider_error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const transactionCookie = request.cookies.get(webTransactionCookieName)?.value;
  if (!code || !state || !transactionCookie) return failed(request, "invalid_callback");

  try {
    const completed = await completeAuthorization(webOidcConfig(), { code, state, transactionCookie });
    const workspaces = await listWorkspaceOptions(completed.session.accessToken);
    const destination = workspaces.length === 0
      ? "/access-pending"
      : workspaces.length === 1
        ? completed.returnTo
        : "/select-workspace";
    const response = NextResponse.redirect(new URL(destination, request.url));
    const maxAge = Math.max(60, Math.floor((completed.session.expiresAt - Date.now()) / 1000));
    response.cookies.set(webSessionCookieName, completed.sessionCookie, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      maxAge,
      path: "/",
    });
    response.cookies.set(webTransactionCookieName, "", { maxAge: 0, path: "/api/auth/callback" });
    response.cookies.set(membershipCookieName, "", { maxAge: 0, path: "/" });
    response.cookies.set(returnToCookieName, "", { maxAge: 0, path: "/" });

    if (workspaces.length === 1 && workspaces[0]) {
      response.cookies.set(membershipCookieName, workspaces[0].membershipId, {
        httpOnly: true,
        secure: secureCookie(),
        sameSite: "lax",
        maxAge,
        path: "/",
      });
    } else if (workspaces.length > 1) {
      response.cookies.set(returnToCookieName, completed.returnTo, {
        httpOnly: true,
        secure: secureCookie(),
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    }
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    return failed(request, "authentication_failed");
  }
}
