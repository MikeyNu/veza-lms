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
      <span className="identity-lockup-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      <span>
        <strong>veza</strong>
        <small>LEARNING CLOUD</small>
      </span>
    </a>
  );
}

function IdentityNetwork() {
  return (
    <div className="identity-network" aria-hidden="true">
      <div className="identity-network-grid" />
      <span className="identity-node identity-node-primary"><b>V</b><small>Learning</small></span>
      <span className="identity-node identity-node-people"><b>12.4k</b><small>People</small></span>
      <span className="identity-node identity-node-courses"><b>184</b><small>Courses</small></span>
      <span className="identity-node identity-node-evidence"><b>Verified</b><small>Evidence</small></span>
      <span className="identity-node identity-node-context"><b>1</b><small>Context</small></span>
      <svg viewBox="0 0 640 360" role="presentation" focusable="false">
        <path d="M316 176 C242 108 196 98 112 108" />
        <path d="M316 176 C403 98 466 93 538 119" />
        <path d="M316 176 C234 217 176 242 104 277" />
        <path d="M316 176 C393 223 455 249 545 270" />
        <path d="M112 108 C151 171 148 221 104 277" />
        <path d="M538 119 C500 172 503 221 545 270" />
      </svg>
    </div>
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
        <IdentityNetwork />
        <dl className="identity-proof-grid">
          <div><dt>Context</dt><dd>Membership derived</dd></div>
          <div><dt>Boundary</dt><dd>Tenant isolated</dd></div>
          <div><dt>Evidence</dt><dd>Audit retained</dd></div>
        </dl>
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
