import { redirect } from "next/navigation";
import { getWebOidcSession } from "../../src/server/web-session";
import { listWorkspaceOptions, WorkspaceApiError } from "../../src/server/workspace-api";

export const dynamic = "force-dynamic";

const errors: Readonly<Record<string, string>> = {
  invalid: "That workspace selection was malformed. Choose a workspace below.",
  unavailable: "That membership is no longer available to this account.",
  service: "Veza could not verify the selection. No workspace was opened; try again.",
};

function roleSummary(roles: readonly string[]): string {
  return roles.map((role) => role.replaceAll("-", " ")).join(" · ");
}

export default async function SelectWorkspacePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, query] = await Promise.all([getWebOidcSession(), searchParams]);
  if (!session) redirect("/sign-in");

  let workspaces;
  try {
    workspaces = await listWorkspaceOptions(session.accessToken);
  } catch (error) {
    if (error instanceof WorkspaceApiError && error.status === 401) redirect("/sign-in");
    throw error;
  }
  if (workspaces.length === 0) redirect("/access-pending");

  return <main className="workspace-select-page">
    <section className="workspace-select-panel">
      <div className="auth-brand-lockup"><span className="brand-mark">V</span><div><strong>veza</strong><small>LEARNING CLOUD</small></div></div>
      <p className="eyebrow">SELECT YOUR CONTEXT</p>
      <h1>Where are you working today?</h1>
      <p>Each workspace carries its own institution, role scope and permissions. You can switch again from the application header.</p>
      {query.error ? <p className="auth-error" role="alert">{errors[query.error] ?? "The workspace could not be selected."}</p> : null}
      <div className="workspace-option-list">
        {workspaces.map((workspace) => <form action="/api/auth/select-workspace" method="post" key={workspace.membershipId}>
          <input type="hidden" name="membershipId" value={workspace.membershipId}/>
          <button className="workspace-option" type="submit">
            <span className="workspace-option-mark">{workspace.tenant.displayName[0]?.toUpperCase() ?? "V"}</span>
            <span><strong>{workspace.tenant.displayName}</strong><small>{workspace.label} · {roleSummary(workspace.roles)}</small></span>
            <b aria-hidden="true">→</b>
          </button>
        </form>)}
      </div>
      <form action="/api/auth/sign-out" method="post"><button className="workspace-signout" type="submit">Sign in with another account</button></form>
    </section>
  </main>;
}
