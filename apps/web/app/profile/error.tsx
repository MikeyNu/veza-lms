"use client";

import { WorkspaceRouteError } from "../../src/components/states/workspace-route-error";

export default function ProfileError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  return (
    <WorkspaceRouteError
      error={error}
      reset={reset}
      eyebrow="ACCOUNT"
      title="Your profile could not be confirmed"
      returnHref="/"
      returnLabel="Return to dashboard"
    />
  );
}
