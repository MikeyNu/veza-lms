import "server-only";

import { notFound } from "next/navigation";
import { canAccessWorkspacePath } from "../features/workspace/access-policy";
import { requireWorkspaceSession } from "./require-workspace-session";

export async function requireWorkspaceAccess(pathname: string) {
  const resolution = await requireWorkspaceSession();
  if (!canAccessWorkspacePath(resolution.session, pathname)) notFound();
  return resolution;
}
