"use client";

export default function ErrorBoundary({ reset }: { readonly error: Error & { readonly digest?: string }; readonly reset: () => void }) {
  return <main className="access-route-state"><section role="alert"><p>ACCESS DIRECTORY INTERRUPTED</p><h1>Membership evidence could not be loaded</h1><span>No access transition was applied. Retry the directory or return to administration.</span><div><button onClick={reset}>Retry directory</button><a href="/admin/institution-setup">Return to administration</a></div></section></main>;
}
