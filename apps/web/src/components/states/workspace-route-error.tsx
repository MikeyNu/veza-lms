"use client";

import { useEffect } from "react";

export function WorkspaceRouteError({
  error,
  reset,
  eyebrow,
  title,
  returnHref = "/",
  returnLabel = "Return to dashboard",
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
  readonly eyebrow: string;
  readonly title: string;
  readonly returnHref?: string;
  readonly returnLabel?: string;
}) {
  useEffect(() => {
    console.error("Workspace route failed", { name: error.name, digest: error.digest });
  }, [error]);

  return (
    <main className="workspace-route-state workspace-route-error">
      <section role="alert">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>The requested data could not be confirmed. No command was applied and the active workspace remains unchanged.</span>
        <div><button type="button" onClick={reset}>Retry this view</button><a href={returnHref}>{returnLabel}</a></div>
        {error.digest ? <small>Support reference: {error.digest}</small> : null}
      </section>
    </main>
  );
}
