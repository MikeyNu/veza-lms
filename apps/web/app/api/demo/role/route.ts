import { NextRequest, NextResponse } from "next/server";
import {
  canAccessPathForRoles,
  canonicalLandingPath,
  roleModulesForDemo,
} from "../../../../src/features/workspace/access-policy";
import {
  demoModeEnabled,
  demoRoleCookieName,
  isDemoRole,
} from "../../../../src/server/demo-mode";

function safeReturnPath(request: NextRequest): string {
  const fallback = "/";
  const referer = request.headers.get("referer");
  if (!referer) return fallback;
  try {
    const target = new URL(referer);
    if (target.origin !== request.nextUrl.origin) return fallback;
    return `${target.pathname}${target.search}`;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  if (!demoModeEnabled()) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const form = await request.formData();
  const role = form.get("role");
  if (typeof role !== "string" || !isDemoRole(role)) {
    return NextResponse.json({ message: "Demo role is invalid" }, { status: 400 });
  }

  const requestedReturnPath = safeReturnPath(request);
  const permittedReturnPath = canAccessPathForRoles(
    [role],
    requestedReturnPath,
    roleModulesForDemo(),
  )
    ? requestedReturnPath
    : canonicalLandingPath(role);

  const response = NextResponse.redirect(new URL(permittedReturnPath, request.url), 303);
  response.cookies.set(demoRoleCookieName, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
