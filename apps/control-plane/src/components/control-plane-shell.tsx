import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthenticatedPrincipal } from "@veza/contracts";

const navigation = [
  { label: "Tenants", href: "/tenants", number: "01", available: true },
  { label: "Provisioning", href: "/tenants/new", number: "02", available: true },
  { label: "Plans", href: "/plans", number: "03", available: true },
  { label: "Release rings", href: "/releases", number: "04", available: false },
  { label: "Service health", href: "/health", number: "05", available: true },
  { label: "Audit", href: "/audit", number: "06", available: true },
  { label: "Delivery recovery", href: "/delivery-failures", number: "07", available: true },
  { label: "Event platform", href: "/events", number: "08", available: true },
  { label: "Observability", href: "/observability", number: "09", available: true },
] as const;

function initials(name: string | undefined): string {
  if (!name) return "VZ";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VZ";
}

export function ControlPlaneShell({ children, active, principal, environmentLabel }: { children: ReactNode; active: string; principal: AuthenticatedPrincipal; environmentLabel: string }) {
  return <div className="cp-shell">
    <aside className="cp-sidebar">
      <Link className="cp-brand" href="/"><span>V</span><div><strong>veza</strong><small>CONTROL PLANE</small></div></Link>
      <p className="cp-nav-label">Service operations</p>
      <nav aria-label="Control-plane navigation">{navigation.map((item) => item.available
        ? <Link className={active === item.href ? "cp-nav-item active" : "cp-nav-item"} href={item.href} key={item.href}><small>{item.number}</small><span>{item.label}</span></Link>
        : <span className="cp-nav-item disabled" aria-disabled="true" title="Introduced in a later implementation gate" key={item.href}><small>{item.number}</small><span>{item.label}</span><em>Planned</em></span>)}</nav>
      <div className="cp-sidebar-spacer"/>
      <div className="cp-boundary"><strong>Privileged boundary</strong><p>Tenant content is not available from this workspace. Elevation requires an audited support case.</p></div>
      <div className="cp-user"><span>{initials(principal.displayName)}</span><div><strong>{principal.displayName ?? principal.email ?? "Veza operator"}</strong><small>Platform operator</small></div><form action="/api/auth/sign-out" method="post"><button aria-label="Sign out" type="submit">↗</button></form></div>
    </aside>
    <main className="cp-main"><header className="cp-topbar"><div><small>Veza fleet</small><strong>{environmentLabel}</strong></div><div className="cp-trust-state" aria-label="Operator identity and audit controls are active"><span aria-hidden="true">✓</span><div><strong>Operator verified</strong><small>Privileged actions are audited</small></div></div></header>{children}</main>
  </div>;
}
