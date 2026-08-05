import Link from "next/link";
import type { PlatformAuditFilters, PlatformAuditPage } from "../../server/platform-audit-api";

function humanize(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextHref(filters: PlatformAuditFilters, cursor: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && key !== "cursor" && key !== "limit") params.set(key, String(value));
  }
  params.set("cursor", cursor);
  return `/audit?${params.toString()}`;
}

export function PlatformAudit({ page, filters }: { page: PlatformAuditPage; filters: PlatformAuditFilters }) {
  return <section className="platform-audit" aria-labelledby="platform-audit-title">
    <header className="platform-audit-heading">
      <div><p className="cp-eyebrow">GLOBAL OPERATOR EVIDENCE</p><h1 id="platform-audit-title">Platform audit</h1><p>Review privileged fleet operations without opening institution content.</p></div>
      <div className="platform-audit-trust"><span aria-hidden="true">✓</span><div><strong>Read only</strong><small>Verified operator boundary</small></div></div>
    </header>
    <div className="platform-audit-layout">
      <aside className="platform-audit-filters">
        <div><p className="cp-eyebrow">FILTER EVIDENCE</p><h2>Find an operator action</h2></div>
        <form method="get" action="/audit">
          <label>Event type<input name="eventType" defaultValue={filters.eventType} placeholder="platform.tenant-provisioned"/></label>
          <label>Actor ID<input name="actorId" defaultValue={filters.actorId} placeholder="Operator UUID"/></label>
          <label>Resource type<input name="resourceType" defaultValue={filters.resourceType} placeholder="tenant"/></label>
          <label>Resource ID<input name="resourceId" defaultValue={filters.resourceId} placeholder="Tenant or operation ID"/></label>
          <div className="platform-audit-dates"><label>From<input type="date" name="from" defaultValue={filters.from}/></label><label>Through<input type="date" name="to" defaultValue={filters.to}/></label></div>
          <div className="platform-audit-actions"><button type="submit">Apply filters</button><Link href="/audit">Clear</Link></div>
        </form>
        <div className="platform-audit-boundary"><strong>Separate evidence plane</strong><p>This stream records Veza operator actions. Tenant evidence remains inside the selected institution workspace.</p></div>
      </aside>
      <main className="platform-audit-stream">
        <header><div><p className="cp-eyebrow">OPERATOR EVENT STREAM</p><h2>{page.items.length === 0 ? "No matching evidence" : `${page.items.length} events loaded`}</h2></div><span>{page.page.limit} per page</span></header>
        {page.items.length === 0 ? <div className="platform-audit-empty"><span aria-hidden="true">◎</span><h3>No operator actions match</h3><p>Clear a filter or verify that the operation writes global evidence.</p></div> : <ol>{page.items.map((event) => <li key={event.id}><div className="platform-audit-marker">OP</div><article><header><div><p>{humanize(event.eventType)}</p><h3>{event.resource.type} <code>{event.resource.id}</code></h3></div><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</time></header><dl><div><dt>Actor</dt><dd>{event.actor.displayName ?? event.actor.email ?? <code>{event.actor.id}</code>}</dd></div><div><dt>Correlation</dt><dd><code>{event.correlationId}</code></dd></div></dl><details><summary>Inspect operational metadata</summary><pre>{JSON.stringify(event.metadata, null, 2)}</pre></details></article></li>)}</ol>}
        {page.page.nextCursor ? <div className="platform-audit-pagination"><Link href={nextHref(filters, page.page.nextCursor)}>Load older evidence <span aria-hidden="true">→</span></Link></div> : null}
      </main>
    </div>
  </section>;
}
