import type { ReactNode } from "react";

export interface IdentityGatewayProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly stage?: string;
  readonly aside?: ReactNode;
  readonly footer?: ReactNode;
}

export function IdentityBrandLockup() {
  return (
    <a className="identity-lockup" href="/" aria-label="Veza Learning Cloud home">
      <img src="/branding/veza-logo-white.png" alt="Veza Learning Cloud" />
    </a>
  );
}

export function IdentityGateway({
  eyebrow,
  title,
  description,
  children,
  stage,
  aside,
  footer,
}: IdentityGatewayProps) {
  return (
    <main className="identity-gateway">
      <section className="identity-story" aria-label="Veza Learning Cloud">
        <header className="identity-story-header">
          <IdentityBrandLockup />
          {stage ? <span className="identity-stage">{stage}</span> : null}
        </header>
        <div className="identity-story-copy">
          <p className="identity-kicker">ONE INSTITUTIONAL CONTEXT</p>
          <h1>Learning operations that remain connected to their evidence.</h1>
          <p>
            Identity, curriculum, delivery, assessment and communication stay inside one governed workspace, with every consequential transition traceable.
          </p>
        </div>
      </section>

      <section className="identity-action-panel">
        <div className="identity-action-shell">
          <header className="identity-action-heading">
            <p>{eyebrow}</p>
            <h2>{title}</h2>
            <span>{description}</span>
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
          <span>{item.state === "complete" ? "✓" : index + 1}</span>
          <div><strong>{item.label}</strong><small>{item.detail}</small></div>
        </li>
      ))}
    </ol>
  );
}
