import type { ReactNode } from "react";

export function OperatorIdentityGateway({
  eyebrow,
  title,
  description,
  children,
  stage = "Operator assurance",
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly stage?: string;
}) {
  return (
    <main className="operator-gateway">
      <section className="operator-gateway-story" aria-label="Veza control plane">
        <header>
          <a className="operator-lockup" href="/">
            <span aria-hidden="true"><i /><i /></span>
            <div><strong>veza</strong><small>CONTROL PLANE</small></div>
          </a>
          <b>{stage}</b>
        </header>
        <div className="operator-gateway-copy">
          <p>FLEET OPERATIONS</p>
          <h1>Operate tenancy, release and service controls without entering tenant content.</h1>
          <span>Every privileged transition is attributable, MFA assured and separated from the institutional application plane.</span>
        </div>
        <div className="operator-boundary-map" aria-hidden="true">
          <div className="operator-core"><strong>CONTROL</strong><small>Global plane</small></div>
          <div className="operator-orbit operator-orbit-tenants"><strong>Tenants</strong><small>Lifecycle</small></div>
          <div className="operator-orbit operator-orbit-release"><strong>Release</strong><small>Rings</small></div>
          <div className="operator-orbit operator-orbit-health"><strong>Health</strong><small>SLOs</small></div>
          <div className="operator-orbit operator-orbit-audit"><strong>Audit</strong><small>Evidence</small></div>
          <svg viewBox="0 0 620 340" focusable="false"><ellipse cx="310" cy="170" rx="235" ry="112" /><ellipse cx="310" cy="170" rx="145" ry="150" /></svg>
        </div>
        <dl>
          <div><dt>Identity</dt><dd>Separate OIDC client</dd></div>
          <div><dt>Assurance</dt><dd>MFA required</dd></div>
          <div><dt>Content</dt><dd>Tenant data excluded</dd></div>
        </dl>
      </section>
      <section className="operator-gateway-action">
        <div>
          <header><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></header>
          <div className="operator-gateway-content">{children}</div>
          <footer>Platform operations are recorded with actor, reason, correlation and release evidence.</footer>
        </div>
      </section>
    </main>
  );
}

export function OperatorStatus({ children }: { readonly children: ReactNode }) {
  return <div className="operator-status" role="alert"><strong>Access was not established</strong><p>{children}</p></div>;
}
