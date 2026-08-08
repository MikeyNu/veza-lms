import type { ReactNode } from "react";
import Link from "next/link";
import type { WorkspaceSession } from "@veza/contracts";
import {
  primaryAction,
  resolveNavigation,
  type NavigationKey,
  workspaceLabel,
} from "../features/workspace/navigation";
import {
  demoModeEnabled,
  demoRoleOptions,
} from "../server/demo-mode";
import { AppShellClient } from "./app-shell-client";

function initials(name: string | undefined): string {
  if (!name) return "VZ";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VZ";
}

function DemoRoleSwitcher({ session }: { session: WorkspaceSession }) {
  if (!demoModeEnabled()) return null;
  const selectedRole = session.membership.roles[0] ?? "learner";

  return (
    <div className="demo-controls" aria-label="Demo inspection controls">
      <Link className="demo-qa-link" href="/demo">QA map</Link>
      <form action="/api/demo/role" method="post" className="demo-role-switcher">
        <label className="visually-hidden" htmlFor="demo-role">Demo role</label>
        <select id="demo-role" name="role" defaultValue={selectedRole}>
          {demoRoleOptions.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
        <button type="submit">Switch</button>
      </form>
    </div>
  );
}

export function AppShell({
  children,
  session,
  active = "home",
}: {
  children: ReactNode;
  session: WorkspaceSession;
  active?: NavigationKey;
}) {
  const demo = demoModeEnabled();
  const action = primaryAction(session);
  const name = session.principal.displayName ?? session.principal.email ?? "Veza user";

  return (
    <>
      <AppShellClient
        navigation={resolveNavigation(session)}
        active={active}
        tenantName={session.tenant.displayName}
        workspaceName={workspaceLabel(session)}
        displayName={name}
        {...(session.principal.email ? { email: session.principal.email } : {})}
        initials={initials(session.principal.displayName)}
        {...(action ? { primaryAction: action } : {})}
        demo={demo}
      >
        {children}
      </AppShellClient>
      {demo ? <div className="demo-inspection-dock"><DemoRoleSwitcher session={session} /></div> : null}
    </>
  );
}
