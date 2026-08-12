"use client";

import { WorkspaceRouteError } from "../../../src/components/states/workspace-route-error";

export default function CourseError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceRouteError error={error} reset={reset} context="Course room" title="This course could not be loaded" returnHref="/learning" returnLabel="Back to my learning" />;
}
