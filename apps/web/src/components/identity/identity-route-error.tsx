"use client";

import { Button, ButtonLink, Link as VezaLink } from "@veza/ui";
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
      context="Identity error"
      title={title}
      description="No new workspace context was installed. Retry the current step or return to secure sign-in."
      {...(error.digest ? { footer: <>Support reference: <code>{error.digest}</code></> } : {})}
    >
      <IdentityStatus tone="danger" title="The service did not confirm this transition">
        Your identity session and institutional access remain unchanged.
      </IdentityStatus>
      <div className="identity-action-stack">
        <Button className="identity-full-action" type="button" onClick={reset}>Retry this step</Button>
        <ButtonLink className="identity-full-action" variant="secondary" href="/sign-in">Return to secure sign-in</ButtonLink>
        <VezaLink variant="quiet" href="/account-help">Review account help</VezaLink>
      </div>
    </IdentityGateway>
  );
}
