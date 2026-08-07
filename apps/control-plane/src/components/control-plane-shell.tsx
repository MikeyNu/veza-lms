import Link from "next/link";
import type { ReactNode } from "react";
import type { AuthenticatedPrincipal } from "@veza/contracts";

const navigation = [
  { label: "Tenants", href: "/tenants", number: "01" },
  { label: "Provisioning", href: "/tenants/new", number: "02" },
  { label: "Plans", href: "/plans", number: "03" },
  { label: "Releases", href: "/releases", number: "04" },
  { label: "Support access", href: "/support", number: "05" },
  { label: "Service health", href: "/health", number: "06" },
  { label: "Audit", href: "/audit", number: "07" },
  { label: "Delivery recovery", href: "/delivery-failures", number: "08" },
  { label: "Event platform", href: "/events", number: "09" },
  { label: "Observability", href: "/observability", number: "10" },
] as const;

function initials(name: string | undefined): string {
  if (!name) return "VZ";
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VZ";
}

export function ControlPlaneShell({ children, active, principal, environmentLabel }: { children: ReactNode; active: string; principal: AuthenticatedPrincipal; environmentLabel: string }) {
  return <div className="cp-shell">
    <aside className="cp-sidebar">
      <Link className="cp-brand" href="/">
        <img src="/branding/veza-app-icon-48.png" width="32" height="32" alt="" aria-hidden="true" />
        <div><strong>veza</strong><small>Control Plane</small></div>
      </Link>
      <p className="cp-nav-label">Service operations</p>
      <nav aria-label="Control-plane navigation">{navigation.map((item) =>
        <Link className={active === item.href ? "cp-nav-item active" : "cp-nav-item"} href={item.href} key={item.href}><small>{item.number}</small><span>{item.label}</span></Link>)}</nav>
      <div className="cp-sidebar-spacer"/>
      <div className="cp-boundary"><strong>Privileged boundary</strong><p>Tenant content is unavailable by default. Access requires customer approval, a purpose-bound case, MFA and an expiring assisted session.</p></div>
      <div className="cp-user"><span>{initials(principal.displayName)}</span><div><strong>{principal.displayName ?? principal.email ?? "Veza operator"}</strong><small>Platform operator</small></div><form action="/api/auth/sign-out" method="post"><button aria-label="Sign out" type="submit">↗</button></form></div>
    </aside>
    <main className="cp-main"><header className="cp-topbar"><div><small>Veza fleet</small><strong>{environmentLabel}</strong></div><div className="cp-trust-state" aria-label="Operator identity and audit controls are active"><span aria-hidden="true">✓</span><div><strong>Operator verified</strong><small>Privileged actions are audited</small></div></div></header>{children}</main>
  </div>;
}
