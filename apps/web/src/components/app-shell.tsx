import type { ReactNode } from "react";
import { primaryNavigation } from "../data/dashboard";
import { Icon, type IconName } from "./icon";

function Sidebar() {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark" aria-hidden="true">V</span><div><strong>veza</strong><small>LEARNING CLOUD</small></div></div>
    <nav aria-label="Primary navigation">
      <p className="nav-label">Workspace</p>
      {primaryNavigation.map(([label, icon], index) => <a className={index === 0 ? "nav-item active" : "nav-item"} href="#" key={label}><Icon name={icon as IconName}/><span>{label}</span>{label === "Assessments" && <em>3</em>}</a>)}
    </nav>
    <div className="sidebar-spacer"/>
    <div className="support-card"><span>?</span><div><strong>Need help?</strong><small>Visit the learning centre</small></div></div>
    <div className="profile"><div className="avatar">MN</div><div><strong>Michael Ndhlovu</strong><small>Product Design</small></div><button aria-label="Open profile menu">•••</button></div>
  </aside>;
}

function Topbar() {
  return <header className="topbar">
    <button className="mobile-menu" aria-label="Open navigation">☰</button>
    <button className="institution"><span className="institution-logo">A</span><span><small>Institution</small><strong>Akha Academy</strong></span><b>⌄</b></button>
    <label className="search"><Icon name="search"/><input aria-label="Search Veza" placeholder="Search courses, resources, people..."/><kbd>⌘ K</kbd></label>
    <button className="icon-button" aria-label="Notifications"><Icon name="bell"/><span className="notification-dot"/></button>
    <button className="primary-button">Create <span>＋</span></button>
  </header>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell"><Sidebar/><main><Topbar/>{children}</main></div>;
}
