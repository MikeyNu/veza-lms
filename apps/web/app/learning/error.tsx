"use client";
import { WorkspaceRouteError } from "../../src/components/states/workspace-route-error";
export default function ErrorBoundary({ error, reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }) { return <WorkspaceRouteError error={error} reset={reset} eyebrow="LEARNING INTERRUPTED" title="Learning participation could not be loaded" />; }
