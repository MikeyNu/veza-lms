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
import { CommandSearch } from "./command-search";
import { Icon } from "./icon";

function initials(name: string | undefined): string {
  if (!name) return "VZ";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VZ";
}

function NavigationLinks({
  session,
  active,
  mobile = false,
}: {
  session: WorkspaceSession;
  active: NavigationKey;
  mobile?: boolean;
}) {
  return (
    <>
      {resolveNavigation(session).map((item) => (
        <Link
          className={mobile ? "mobile-nav-link" : `nav-link ${item.key === active ? "active" : ""}`}
          href={item.href}
          key={item.key}
          aria-current={item.key === active ? "page" : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
          {item.badge ? <span className="badge">{item.badge}</span> : null}
        </Link>
      ))}
    </>
  );
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/api/auth/sign-out" method="post" className={className}>
      <button type="submit" aria-label="Sign out"><Icon name="arrow" /></button>
    </form>
  );
}

function Sidebar({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  return (
    <aside className="sidebar" aria-label="Primary workspace">
      <Link className="brand" href="/" aria-label="Veza Learning Cloud home">
        <img
          className="brand-logo"
          src="/branding/veza-logo-white.png"
          alt="Veza LMS"
          width="1400"
          height="611"
        />
      </Link>

      <nav className="nav" aria-label={`${workspaceLabel(session)} navigation`}>
        <NavigationLinks session={session} active={active} />
      </nav>

      <div className="side-bottom">
        <div className="profile">
          <span className="avatar">{initials(session.principal.displayName)}</span>
          <div>
            <strong>{session.tenant.displayName}</strong>
            <small>{workspaceLabel(session)}</small>
          </div>
          <SignOutButton className="profile-signout" />
        </div>

        <Link className="support-link" href="/help">
          <span><Icon name="help" /></span>
          <div><strong>Help &amp; Support</strong><small>Guides, policy and support cases</small></div>
          <Icon name="arrow" />
        </Link>
      </div>
    </aside>
  );
}

function MobileNavigation({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  return (
    <details className="mobile-nav">
      <summary aria-label="Open workspace navigation"><Icon name="grid" /></summary>
      <div className="mobile-nav-panel">
        <div className="mobile-nav-account">
          <span className="avatar">{initials(session.principal.displayName)}</span>
          <div>
            <strong>{session.principal.displayName ?? session.principal.email ?? "Veza user"}</strong>
            <small>{workspaceLabel(session)}</small>
          </div>
        </div>
        <nav aria-label="Mobile navigation">
          <NavigationLinks session={session} active={active} mobile />
        </nav>
        <SignOutButton className="mobile-signout" />
      </div>
    </details>
  );
}

function DemoRoleSwitcher({ session }: { session: WorkspaceSession }) {
  if (!demoModeEnabled()) return null;
  const selectedRole = session.membership.roles[0] ?? "learner";

  return (
    <div className="demo-controls" aria-label="Demo inspection controls">
      <Link className="demo-qa-link" href="/demo">QA map</Link>
      <form action="/api/demo/role" method="post" className="demo-role-switcher">
        <select name="role" defaultValue={selectedRole} aria-label="Demo role">
          {demoRoleOptions.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
        <button type="submit">Switch</button>
      </form>
    </div>
  );
}

function Topbar({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  const action = primaryAction(session);

  return (
    <header className="topbar">
      <MobileNavigation session={session} active={active} />
      <CommandSearch />

      <Link
        className="institution"
        href="/select-workspace"
        aria-label={`Switch institution. Current institution: ${session.tenant.displayName}`}
      >
        <span className="institution-logo" aria-hidden="true">▥</span>
        <span><small>Institution</small><strong>{session.tenant.displayName}</strong></span>
        <b className="chev" aria-hidden="true">⌄</b>
      </Link>

      <div className="top-actions">
        <DemoRoleSwitcher session={session} />
        <Link className="topbar-tool" href="/communicate" aria-label="Notifications">
          <Icon name="bell" /><span>Notifications</span>
        </Link>
        {action ? (
          <Link className="primary-button" href={action.href}>
            <span aria-hidden="true">+</span><span>{action.label}</span>
          </Link>
        ) : null}
        <Link className="topbar-tool" href="/profile" aria-label="Open profile">
          <span className="avatar">{initials(session.principal.displayName)}</span>
        </Link>
      </div>
    </header>
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
  return (
    <div className="shell">
      <Sidebar session={session} active={active} />
      <div className="main-area">
        <Topbar session={session} active={active} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
