import type { Route } from "next";
import type { NavigationItem, NavigationKey } from "./navigation";

export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: Route;
}

const standaloneLabels: Readonly<Record<string, string>> = {
  "/access-pending": "Access pending",
  "/account-help": "Account help",
  "/design-system": "Design system",
  "/invitation": "Invitation",
  "/reset-password": "Password recovery",
  "/select-workspace": "Select workspace",
  "/sign-in": "Sign in",
};

const adminLabels: Readonly<Record<string, string>> = {
  "/admin/access": "Access administration",
  "/admin/institution-setup": "Institution setup",
  "/admin/service-accounts": "Service accounts",
  "/admin/storage": "Storage",
  "/admin/terminology": "Terminology",
};

function navigationItem(
  navigation: readonly NavigationItem[],
  key: NavigationKey,
): NavigationItem | undefined {
  return navigation.find((item) => item.key === key);
}

function workspaceRoot(navigation: readonly NavigationItem[]): BreadcrumbItem[] {
  const home = navigationItem(navigation, "home");
  return home ? [{ label: home.label, href: home.href }] : [];
}

function current(label: string): BreadcrumbItem {
  return { label };
}

function workspaceSection(
  navigation: readonly NavigationItem[],
  key: NavigationKey,
  label?: string,
): readonly BreadcrumbItem[] {
  const section = navigationItem(navigation, key);
  if (!section) return [...workspaceRoot(navigation), current(label ?? "Workspace")];
  if (!label || label === section.label) {
    return [...workspaceRoot(navigation), current(section.label)];
  }
  return [...workspaceRoot(navigation), { label: section.label, href: section.href }, current(label)];
}

function fallbackLabel(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "Workspace";
  if (/^[0-9a-f-]{20,}$/i.test(segment)) return "Record";
  return decodeURIComponent(segment)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function resolveBreadcrumbs(
  pathname: string,
  navigation: readonly NavigationItem[] = [],
): readonly BreadcrumbItem[] {
  if (pathname === "/") {
    const home = navigationItem(navigation, "home");
    return [current(home?.label ?? "Workspace")];
  }

  if (pathname.startsWith("/verify/")) {
    return [{ label: "Veza LMS", href: "/" }, current("Credential verification")];
  }

  const standalone = standaloneLabels[pathname];
  if (standalone) return [{ label: "Veza LMS", href: "/" }, current(standalone)];

  if (pathname === "/today") return workspaceSection(navigation, "home", "Today");
  if (pathname === "/demo") return [...workspaceRoot(navigation), current("Screen inspection map")];
  if (pathname === "/profile") return [...workspaceRoot(navigation), current("Profile")];
  if (pathname.startsWith("/courses/")) return workspaceSection(navigation, "learning", "Course room");
  if (pathname.startsWith("/gradebook/")) return workspaceSection(navigation, "assess", "Gradebook");
  if (pathname.startsWith("/studio/lessons/")) return workspaceSection(navigation, "studio", "Lesson editor");
  if (pathname === "/people/duplicates") return workspaceSection(navigation, "people", "Duplicate review");
  if (pathname === "/people/invitations/new") return workspaceSection(navigation, "people", "Invite tenant owner");
  if (/^\/people\/[^/]+\/?$/.test(pathname)) return workspaceSection(navigation, "people", "Person record");
  if (pathname === "/evidence/exports") return workspaceSection(navigation, "evidence", "Governed exports");

  const adminLabel = adminLabels[pathname];
  if (adminLabel) return workspaceSection(navigation, "admin", adminLabel);

  const section = navigation.find((item) => item.href === pathname);
  if (section) return workspaceSection(navigation, section.key);

  return [...workspaceRoot(navigation), current(fallbackLabel(pathname))];
}
