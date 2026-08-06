"use client";
import { WorkspaceRouteError } from "../../src/components/states/workspace-route-error";
export default function ErrorBoundary({ error, reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }) { return <WorkspaceRouteError error={error} reset={reset} eyebrow="ASSESSMENT INTERRUPTED" title="Assessment evidence could not be loaded" returnHref="/learning" returnLabel="Return to learning" />; }
