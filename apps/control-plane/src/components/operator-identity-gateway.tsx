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
    <main className="operator-gateway" data-stage={stage}>
      <section className="operator-gateway-story" aria-label="Veza LMS">
        <div className="operator-story-inner">
          <header className="operator-story-header">
            <a className="operator-lockup" href="/" aria-label="Veza LMS control plane home">
              <img src="/assets/veza_logo_white_text_horizontal.png" alt="Veza LMS" />
            </a>
          </header>
          <div className="operator-gateway-copy">
            <span className="operator-brand-rule" aria-hidden="true" />
            <h1>Teach. Learn. Grow. Together.</h1>
            <p>
              Veza LMS is the all-in-one learning platform that empowers institutions to create engaging learning experiences, streamline operations, and enable every learner to achieve more.
            </p>
          </div>
        </div>
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
