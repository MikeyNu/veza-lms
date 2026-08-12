"use client";

import { WorkspaceRouteError } from "../../src/components/states/workspace-route-error";

export default function LearningError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceRouteError error={error} reset={reset} context="Learning workspace" title="Learning could not be loaded" />;
}
