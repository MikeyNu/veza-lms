import { CheckIcon } from "@veza/ui";
import type { ReactNode } from "react";
import { BreadcrumbFallback } from "../route-breadcrumbs";

export interface IdentityGatewayProps {
  readonly context?: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly aside?: ReactNode;
  readonly footer?: ReactNode;
}

export function IdentityBrandLockup() {
  return (
    <a className="identity-lockup" href="/" aria-label="Veza LMS home">
      <img src="/assets/veza_logo_white_text_horizontal.png" alt="Veza LMS" />
    </a>
  );
}

export function IdentityGateway({
  context,
  title,
  description,
  children,
  aside,
  footer,
}: IdentityGatewayProps) {
  return (
    <main className="identity-gateway">
      <section className="identity-story" aria-label="Veza LMS">
        <div className="identity-story-inner">
          <header className="identity-story-header">
            <IdentityBrandLockup />
          </header>
          <div className="identity-story-copy">
            <p className="identity-story-title">Verified access before institutional data.</p>
            <p>
              Veza opens a workspace only after your institution's identity provider and membership checks establish the tenant, role and scope for the session.
            </p>
          </div>
        </div>
      </section>

      <section className="identity-action-panel">
        <div className="identity-action-shell">
          <BreadcrumbFallback variant="identity" />
          <header className="identity-action-heading">
            {context ? <p className="identity-action-context">{context}</p> : null}
            <h1>{title}</h1>
            <p className="identity-action-description">{description}</p>
          </header>
          <div className="identity-action-content">{children}</div>
          {aside ? <aside className="identity-context-note">{aside}</aside> : null}
          {footer ? <footer className="identity-action-footer">{footer}</footer> : null}
        </div>
      </section>
    </main>
  );
}

export function IdentityStatus({
  tone = "neutral",
  title,
  children,
}: {
  readonly tone?: "neutral" | "danger" | "success" | "warning";
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={`identity-status identity-status-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function IdentitySteps({ items }: { readonly items: readonly { readonly label: string; readonly detail: string; readonly state?: "current" | "complete" }[] }) {
  return (
    <ol className="identity-steps">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} data-state={item.state ?? "upcoming"}>
          <span aria-hidden="true">{item.state === "complete" ? <CheckIcon size={15} strokeWidth={2} /> : index + 1}</span>
          <div><strong>{item.label}</strong><small>{item.detail}</small></div>
        </li>
      ))}
    </ol>
  );
}
