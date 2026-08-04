import { isSameOriginRequest, secureReturnTo } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  membershipCookieName,
  returnToCookieName,
  secureCookie,
} from "../../../../src/server/auth-config";
import { getWebOidcSession } from "../../../../src/server/web-session";
import { listWorkspaceOptions, WorkspaceApiError } from "../../../../src/server/workspace-api";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin workspace selection is not allowed." }, { status: 403 });
  }

  const session = await getWebOidcSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  const form = await request.formData();
  const membershipId = form.get("membershipId");
  if (typeof membershipId !== "string" || !uuidPattern.test(membershipId)) {
    return NextResponse.redirect(new URL("/select-workspace?error=invalid", request.url), 303);
  }

  try {
    const workspaces = await listWorkspaceOptions(session.accessToken);
    if (!workspaces.some((workspace) => workspace.membershipId === membershipId)) {
      return NextResponse.redirect(new URL("/select-workspace?error=unavailable", request.url), 303);
    }
  } catch (error) {
    if (error instanceof WorkspaceApiError && error.status === 401) {
      return NextResponse.redirect(new URL("/sign-in", request.url), 303);
    }
    return NextResponse.redirect(new URL("/select-workspace?error=service", request.url), 303);
  }

  const returnTo = secureReturnTo(request.cookies.get(returnToCookieName)?.value);
  const result = NextResponse.redirect(new URL(returnTo, request.url), 303);
  result.cookies.set(membershipCookieName, membershipId, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    maxAge: Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000)),
    path: "/",
  });
  result.cookies.set(returnToCookieName, "", { maxAge: 0, path: "/" });
  result.headers.set("cache-control", "no-store");
  return result;
}
