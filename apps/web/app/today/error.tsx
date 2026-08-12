"use client";

import { WorkspaceRouteError } from "../../src/components/states/workspace-route-error";

export default function TodayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceRouteError error={error} reset={reset} context="My learning" title="Today's learning could not be loaded" returnHref="/learning" returnLabel="Open my learning" />;
}
