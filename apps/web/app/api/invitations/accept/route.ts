import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";
import {
  membershipCookieName,
  secureCookie,
} from "../../../../../src/server/auth-config";
import {
  acceptMembershipInvitation,
  InvitationApiError,
} from "../../../../../src/server/invitation-api";
import { getWebOidcSession } from "../../../../../src/server/web-session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invitationPath(invitationId: string, token: string, error?: string): string {
  const parameters = new URLSearchParams({ invitationId, token });
  if (error) parameters.set("error", error);
  return `/invitation?${parameters}`;
}

function errorCode(error: unknown): string {
  if (!(error instanceof InvitationApiError)) return "service";
  if (error.status === 401) return "session";
  if (error.status === 403) return "identity";
  if (error.status === 404) return "not-found";
  if (error.status === 409) return "accepted";
  if (error.status === 410) return "expired";
  if (error.status >= 500) return "service";
  return "invalid";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin invitation acceptance is not allowed." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const form = await request.formData();
  const invitationId = form.get("invitationId");
  const token = form.get("token");
  if (
    typeof invitationId !== "string"
    || !uuidPattern.test(invitationId)
    || typeof token !== "string"
    || token.length < 32
    || token.length > 2048
  ) {
    return NextResponse.redirect(new URL("/invitation?error=invalid", request.url), 303);
  }

  const session = await getWebOidcSession();
  if (!session) {
    const returnTo = invitationPath(invitationId, token);
    return NextResponse.redirect(
      new URL(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, request.url),
      303,
    );
  }

  try {
    const receipt = await acceptMembershipInvitation(session.accessToken, invitationId, token);
    const response = NextResponse.redirect(new URL("/?invitation=accepted", request.url), 303);
    response.cookies.set(membershipCookieName, receipt.membershipId, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      maxAge: Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000)),
      path: "/",
    });
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch (error) {
    const response = NextResponse.redirect(
      new URL(invitationPath(invitationId, token, errorCode(error)), request.url),
      303,
    );
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  }
}
