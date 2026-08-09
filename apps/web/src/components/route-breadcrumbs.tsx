"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavigationItem } from "../features/workspace/navigation";
import { resolveBreadcrumbs } from "../features/workspace/breadcrumb-model";

export type BreadcrumbVariant = "workspace" | "identity" | "standalone" | "public";

export function BreadcrumbFallback({ variant }: { readonly variant: BreadcrumbVariant }) {
  return <div className={`breadcrumbs-fallback breadcrumbs-fallback--${variant}`} aria-hidden="true" />;
}

export function RouteBreadcrumbs({
  navigation = [],
  variant,
}: {
  readonly navigation?: readonly NavigationItem[];
  readonly variant: BreadcrumbVariant;
}) {
  const pathname = usePathname();
  const items = resolveBreadcrumbs(pathname, navigation);

  return (
    <nav className={`breadcrumbs breadcrumbs--${variant}`} aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {index > 0 ? <span className="breadcrumb-separator" aria-hidden="true">/</span> : null}
              {!isCurrent && item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isCurrent ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
