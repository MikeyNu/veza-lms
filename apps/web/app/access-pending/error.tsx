"use client";

import { IdentityRouteError } from "../../src/components/identity/identity-route-error";

export default function ErrorBoundary({ error, reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }) {
  return <IdentityRouteError error={error} reset={reset} title="Membership status could not be checked" />;
}
