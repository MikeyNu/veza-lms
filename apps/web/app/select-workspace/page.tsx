import { Button, Icon } from "@veza/ui";
import { redirect } from "next/navigation";
import {
  IdentityGateway,
  IdentityStatus,
} from "../../src/components/identity/identity-gateway";
import { getWebOidcSession } from "../../src/server/web-session";
import { listWorkspaceOptions, WorkspaceApiError } from "../../src/server/workspace-api";

export const dynamic = "force-dynamic";

const errors: Readonly<Record<string, { readonly title: string; readonly detail: string }>> = {
  invalid: {
    title: "The workspace selector was invalid",
    detail: "No workspace was opened. Choose one of the verified memberships below.",
  },
  unavailable: {
    title: "That membership is no longer available",
    detail: "Its status or validity changed after sign-in. Select another current membership.",
  },
  service: {
    title: "Veza could not verify the selection",
    detail: "No tenant context was installed. Retry the selection after the service is available.",
  },
};

function roleSummary(roles: readonly string[]): string {
  return roles.map((role) => role.replaceAll("-", " ")).join(" · ");
}

export default async function SelectWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, query] = await Promise.all([getWebOidcSession(), searchParams]);
  if (!session) redirect("/sign-in?returnTo=/select-workspace");

  let workspaces;
  try {
    workspaces = await listWorkspaceOptions(session.accessToken);
  } catch (error) {
    if (error instanceof WorkspaceApiError && error.status === 401) redirect("/sign-in");
    throw error;
  }
  if (workspaces.length === 0) redirect("/access-pending");

  const error = query.error ? errors[query.error] : undefined;
  return (
    <IdentityGateway
      context="Workspace selection"
      title="Choose the membership that should govern this session."
      description="Each option is resolved from your verified identity. Veza installs tenant context only after the selected membership is checked again server-side."
      aside={<><strong>Check the institution and role before continuing.</strong><span>The active workspace controls which records, actions and institutional terminology are available.</span></>}
      footer={<form action="/api/auth/sign-out" method="post"><Button variant="quiet" type="submit">Sign in with another account</Button></form>}
    >
      {error ? <IdentityStatus tone="danger" title={error.title}>{error.detail}</IdentityStatus> : null}
      <div className="identity-workspace-list">
        {workspaces.map((workspace) => (
          <form action="/api/auth/select-workspace" method="post" key={workspace.membershipId}>
            <input type="hidden" name="membershipId" value={workspace.membershipId} />
            <button className="identity-workspace-option" type="submit">
              <span className="identity-workspace-mark">{workspace.tenant.displayName[0]?.toUpperCase() ?? "V"}</span>
              <span>
                <strong>{workspace.tenant.displayName}</strong>
                <small>{workspace.label} · {roleSummary(workspace.roles)}</small>
              </span>
              <Icon name="arrow" size="small" />
            </button>
          </form>
        ))}
      </div>
    </IdentityGateway>
  );
}
