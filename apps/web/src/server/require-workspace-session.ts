import { redirect } from "next/navigation";
import { resolveWorkspaceSession } from "./workspace-session";

export async function requireWorkspaceSession() {
  const resolution = await resolveWorkspaceSession();
  if (resolution.status === "signed-out") redirect("/sign-in");
  if (resolution.status === "select-workspace") redirect("/select-workspace");
  if (resolution.status === "access-pending") redirect("/access-pending");
  return resolution;
}
