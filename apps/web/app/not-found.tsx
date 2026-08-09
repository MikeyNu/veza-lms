import Link from "next/link";

export default function NotFound() {
  return (
    <main className="workspace-route-state workspace-route-error">
      <section>
        <p>PAGE UNAVAILABLE</p>
        <h1>This page is not available</h1>
        <span>
          The address may be incorrect, or your current workspace role may not include this area.
        </span>
        <div>
          <Link href="/">Return to dashboard</Link>
          <Link href="/help">Open help</Link>
        </div>
      </section>
    </main>
  );
}
