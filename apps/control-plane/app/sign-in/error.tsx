"use client";

import { OperatorIdentityGateway, OperatorStatus } from "../../src/components/operator-identity-gateway";

export default function ErrorBoundary({ reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }) {
  return (
    <OperatorIdentityGateway eyebrow="OPERATOR FLOW INTERRUPTED" title="Operator assurance could not be prepared" description="No control-plane session was created and no privileged operation was opened.">
      <OperatorStatus>The identity or assurance service did not confirm this transition.</OperatorStatus>
      <div className="operator-action-stack">
        <button className="operator-primary" type="button" onClick={reset}>Retry operator sign-in</button>
        <a className="operator-secondary" href="/sign-in">Start a new sign-in</a>
      </div>
    </OperatorIdentityGateway>
  );
}
