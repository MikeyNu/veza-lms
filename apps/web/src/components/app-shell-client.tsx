"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ButtonLink, DropdownMenu, Tooltip, TooltipProvider } from "@veza/ui";
import type { NavigationItem, NavigationKey } from "../features/workspace/navigation";
import { CommandSearch } from "./command-search";
import { Icon } from "./icon";
import { NotificationPopover } from "./notification-popover";

const SIDEBAR_STORAGE_KEY = "veza.sidebar.collapsed";

interface AppShellClientProps {
  readonly children: ReactNode;
  readonly navigation: readonly NavigationItem[];
  readonly active: NavigationKey;
  readonly tenantName: string;
  readonly workspaceName: string;
  readonly displayName: string;
  readonly initials: string;
  readonly primaryAction?: Readonly<{ label: string; href: Route }>;
  readonly demo: boolean;
}

function DesktopNavigation({
  navigation,
  active,
  collapsed,
}: {
  readonly navigation: readonly NavigationItem[];
  readonly active: NavigationKey;
  readonly collapsed: boolean;
}) {
  return (
    <nav className="nav" aria-label="Primary workspace navigation">
      {navigation.map((item) => {
        const link = (
          <Link
            className={`nav-link ${item.key === active ? "active" : ""}`}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
          >
            <span className="nav-link__icon" aria-hidden="true"><Icon name={item.icon} /></span>
            <span className="nav-link__label">{item.label}</span>
            {item.badge ? <span className="badge">{item.badge}</span> : null}
          </Link>
        );
        return collapsed
          ? <Tooltip key={item.key} trigger={link} content={item.label} placement="right" />
          : <span className="nav-link-wrap" key={item.key}>{link}</span>;
      })}
    </nav>
  );
}

function MobileNavigation({
  navigation,
  active,
  displayName,
  workspaceName,
  initials,
}: {
  readonly navigation: readonly NavigationItem[];
  readonly active: NavigationKey;
  readonly displayName: string;
  readonly workspaceName: string;
  readonly initials: string;
}) {
  return (
    <details className="mobile-nav">
      <summary aria-label="Open workspace navigation"><Icon name="grid" /></summary>
      <div className="mobile-nav-panel">
        <div className="mobile-nav-account">
          <span className="avatar">{initials}</span>
          <div><strong>{displayName}</strong><small>{workspaceName}</small></div>
        </div>
        <nav aria-label="Mobile navigation">
          {navigation.map((item) => (
            <Link
              className="mobile-nav-link"
              href={item.href}
              key={item.key}
              aria-current={item.key === active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </details>
  );
}

export function AppShellClient({
  children,
  navigation,
  active,
  tenantName,
  workspaceName,
  displayName,
  initials,
  primaryAction,
  demo,
}: AppShellClientProps) {
  const router = useRouter();
  const signOutForm = useRef<HTMLFormElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  }, []);

  const setSidebarCollapsed = (next: boolean) => {
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
  };

  return (
    <TooltipProvider>
      <div className={`shell${collapsed ? " shell--collapsed" : ""}`} data-sidebar-state={collapsed ? "collapsed" : "expanded"}>
        <aside className="sidebar" aria-label="Primary workspace">
          <Link className="brand" href="/" aria-label="Veza Learning Cloud home">
            <img
              className="brand-logo brand-logo--full"
              src="/branding/veza-logo-white.png"
              alt="Veza LMS"
              width="1400"
              height="611"
            />
            <img
              className="brand-logo brand-logo--symbol"
              src="/branding/veza-symbol-128.png"
              alt=""
              width="128"
              height="128"
              aria-hidden="true"
            />
          </Link>

          <DesktopNavigation navigation={navigation} active={active} collapsed={collapsed} />

          <div className="side-bottom">
            {collapsed ? (
              <Tooltip
                placement="right"
                content="Help and support"
                trigger={(
                  <Link className="support-link support-link--collapsed" href="/help" aria-label="Help and support">
                    <Icon name="help" />
                  </Link>
                )}
              />
            ) : (
              <Link className="support-link" href="/help">
                <span className="support-link__icon"><Icon name="help" /></span>
                <div><strong>Help &amp; Support</strong><small>Guides, policy and support cases</small></div>
                <Icon name="arrow" />
              </Link>
            )}
          </div>

          <Tooltip
            placement="right"
            content={collapsed ? "Expand navigation" : "Collapse navigation"}
            trigger={(
              <button
                type="button"
                className="sidebar-collapse"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                onClick={() => setSidebarCollapsed(!collapsed)}
              >
                <Icon name={collapsed ? "chevron-right" : "chevron-left"} size="small" />
              </button>
            )}
          />
        </aside>

        <div className="main-area">
          <header className="topbar">
            <MobileNavigation navigation={navigation} active={active} displayName={displayName} workspaceName={workspaceName} initials={initials} />
            <CommandSearch />

            <Link
              className="institution"
              href="/select-workspace"
              aria-label={`Change institution. Current institution: ${tenantName}`}
            >
              <span className="institution-logo" aria-hidden="true"><Icon name="building" /></span>
              <span className="institution-copy"><small>Institution</small><strong>{tenantName}</strong></span>
            </Link>

            <div className="top-actions">
              <NotificationPopover demo={demo} />
              {primaryAction ? (
                <ButtonLink href={primaryAction.href} leadingIcon={<Icon name="plus" />}>
                  {primaryAction.label}
                </ButtonLink>
              ) : null}
              <span className="topbar-divider" aria-hidden="true" />
              <DropdownMenu
                label="Account menu"
                align="end"
                trigger={(
                  <button type="button" className="topbar-tool profile-trigger" aria-label="Open account menu">
                    <span className="avatar">{initials}</span>
                    <span className="profile-chevron" aria-hidden="true"><Icon name="chevron-down" size="small" /></span>
                  </button>
                )}
                entries={[
                  { type: "label", key: "identity", label: displayName },
                  { key: "profile", label: "Profile and preferences", icon: <Icon name="user" />, onSelect: () => router.push("/profile") },
                  { key: "workspace", label: "Change institution", icon: <Icon name="building" />, onSelect: () => router.push("/select-workspace") },
                  { key: "help", label: "Help and support", icon: <Icon name="help" />, onSelect: () => router.push("/help") },
                  { type: "separator", key: "account-separator" },
                  { key: "sign-out", label: "Sign out", icon: <Icon name="log-out" />, destructive: true, onSelect: () => signOutForm.current?.requestSubmit() },
                ]}
              />
              <form ref={signOutForm} action="/api/auth/sign-out" method="post" className="topbar-signout-form" aria-hidden="true" />
            </div>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
