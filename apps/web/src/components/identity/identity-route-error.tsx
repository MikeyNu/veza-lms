"use client";

import { useEffect } from "react";
import { IdentityGateway, IdentityStatus } from "./identity-gateway";

export function IdentityRouteError({
  error,
  reset,
  title = "This identity step could not be completed",
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
  readonly title?: string;
}) {
  useEffect(() => {
    console.error("Identity route failed", { digest: error.digest, name: error.name });
  }, [error]);

  return (
    <IdentityGateway
      eyebrow="IDENTITY FLOW INTERRUPTED"
      title={title}
      description="No new workspace context was installed. Retry the current step or return to secure sign-in."
      stage="Recoverable error"
      {...(error.digest ? { footer: <>Support reference: <code>{error.digest}</code></> } : {})}
    >
      <IdentityStatus tone="danger" title="The service did not confirm this transition">
        Your identity session and institutional access remain unchanged.
      </IdentityStatus>
      <div className="identity-action-stack">
        <button className="identity-primary" type="button" onClick={reset}>Retry this step</button>
        <a className="identity-secondary" href="/sign-in">Return to secure sign-in</a>
        <a className="identity-text-link" href="/account-help">Review account help</a>
      </div>
    </IdentityGateway>
  );
}
