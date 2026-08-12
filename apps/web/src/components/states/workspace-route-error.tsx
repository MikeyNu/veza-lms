"use client";

import { Button, ButtonLink } from "@veza/ui";
import { useEffect } from "react";

export function WorkspaceRouteError({
  error,
  reset,
  title,
  context,
  eyebrow,
  returnHref = "/",
  returnLabel = "Return to dashboard",
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
  readonly title: string;
  readonly context?: string;
  readonly eyebrow?: string;
  readonly returnHref?: string;
  readonly returnLabel?: string;
}) {
  useEffect(() => {
    console.error("Workspace route failed", { name: error.name, digest: error.digest });
  }, [error]);

  const announcedContext = context ?? eyebrow;
  return (
    <main className="workspace-route-state workspace-route-error">
      <section role="alert" aria-label={announcedContext ? `${announcedContext}: ${title}` : title}>
        <h1>{title}</h1>
        <p>The requested data could not be confirmed. No command was applied and the active workspace remains unchanged.</p>
        <div className="workspace-route-error-actions">
          <Button type="button" onClick={reset}>Retry this view</Button>
          <ButtonLink variant="secondary" href={returnHref}>{returnLabel}</ButtonLink>
        </div>
        {error.digest ? <small>Support reference: <code>{error.digest}</code></small> : null}
      </section>
    </main>
  );
}
