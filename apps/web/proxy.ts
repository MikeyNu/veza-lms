import type { BaselineRoleKey } from "@veza/contracts";
import { NextRequest, NextResponse } from "next/server";
import {
  allWorkspaceRoles,
  canAccessPathForRoles,
  canonicalLandingPath,
  roleModulesForDemo,
} from "./src/features/workspace/access-policy";

const demoRoleCookieName = "veza_demo_role";
const validRoles = new Set<BaselineRoleKey>(allWorkspaceRoles);

function demoRole(request: NextRequest): BaselineRoleKey {
  const cookieRole = request.cookies.get(demoRoleCookieName)?.value;
  if (cookieRole && validRoles.has(cookieRole as BaselineRoleKey)) return cookieRole as BaselineRoleKey;

  const environmentRole = process.env.VEZA_DEMO_ROLE
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => validRoles.has(value as BaselineRoleKey));
  return environmentRole as BaselineRoleKey | undefined ?? "learner";
}

export function proxy(request: NextRequest) {
  if (process.env.VEZA_DEMO_MODE !== "true") return NextResponse.next();

  const role = demoRole(request);
  const pathname = request.nextUrl.pathname;
  const allowed = canAccessPathForRoles([role], pathname, roleModulesForDemo());
  if (allowed) return NextResponse.next();

  const landing = canonicalLandingPath(role);
  if (pathname === landing) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = landing;
  target.search = "";
  return NextResponse.redirect(target, 307);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|branding|fonts|sign-in|auth|select-workspace|access-pending).*)",
  ],
};
