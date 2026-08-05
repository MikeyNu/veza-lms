import type { ReactNode } from "react";
import Link from "next/link";
import type { WorkspaceSession } from "@veza/contracts";
import {
  primaryAction,
  resolveNavigation,
  type NavigationKey,
  workspaceLabel,
} from "../features/workspace/navigation";
import { CommandSearch } from "./command-search";
import { Icon } from "./icon";

function initials(name: string | undefined): string {
  if (!name) return "VZ";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VZ";
}

function NavigationLinks({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  return <>{resolveNavigation(session).map((item) => <Link className={item.key === active ? "nav-item active" : "nav-item"} href={item.href} key={item.key} aria-current={item.key === active ? "page" : undefined}><Icon name={item.icon}/><span>{item.label}</span>{item.badge ? <em>{item.badge}</em> : null}</Link>)}</>;
}

function SignOutButton({ className }: { className?: string }) {
  return <form action="/api/auth/sign-out" method="post" className={className}><button type="submit">Sign out</button></form>;
}

function Sidebar({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  return <aside className="sidebar">
    <Link className="brand" href="/" aria-label="Veza home"><span className="brand-mark" aria-hidden="true">V</span><div><strong>veza</strong><small>LEARNING CLOUD</small></div></Link>
    <nav aria-label="Primary navigation">
      <p className="nav-label">{workspaceLabel(session)}</p>
      <NavigationLinks session={session} active={active}/>
    </nav>
    <div className="sidebar-spacer"/>
    <Link className="support-card" href="/help"><span>?</span><div><strong>Need help?</strong><small>Visit the learning centre</small></div></Link>
    <div className="profile"><div className="avatar">{initials(session.principal.displayName)}</div><div><strong>{session.principal.displayName ?? session.principal.email ?? "Veza user"}</strong><small>{workspaceLabel(session)}</small></div><SignOutButton className="profile-signout"/></div>
  </aside>;
}

function MobileNavigation({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  return <details className="mobile-navigation">
    <summary aria-label="Open navigation"><Icon name="grid"/></summary>
    <div className="mobile-navigation-panel">
      <div className="mobile-navigation-heading"><div className="avatar">{initials(session.principal.displayName)}</div><span><strong>{session.principal.displayName ?? session.principal.email ?? "Veza user"}</strong><small>{workspaceLabel(session)}</small></span></div>
      <nav aria-label="Mobile navigation"><NavigationLinks session={session} active={active}/></nav>
      <SignOutButton className="mobile-signout"/>
    </div>
  </details>;
}

function Topbar({ session, active }: { session: WorkspaceSession; active: NavigationKey }) {
  const action = primaryAction(session);
  return <header className="topbar">
    <MobileNavigation session={session} active={active}/>
    <Link className="institution" href="/select-workspace" aria-label={`Switch institution. Current institution: ${session.tenant.displayName}`}><span className="institution-logo">{session.tenant.displayName[0]?.toUpperCase() ?? "V"}</span><span><small>Institution</small><strong>{session.tenant.displayName}</strong></span><b aria-hidden="true">⌄</b></Link>
    <CommandSearch/>
    {action ? <Link className="primary-button" href={action.href}>{action.label} <span aria-hidden="true">＋</span></Link> : null}
  </header>;
}

export function AppShell({ children, session, active = "home" }: { children: ReactNode; session: WorkspaceSession; active?: NavigationKey }) {
  return <div className="app-shell"><Sidebar session={session} active={active}/><main><Topbar session={session} active={active}/>{children}</main></div>;
}
