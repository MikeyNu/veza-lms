import type { WorkspaceSession } from "@veza/contracts";
import type { Route } from "next";
import Link from "next/link";
import type { AuditEventPage, AuditFilters } from "../../server/audit-api";

const exportManagerRoles = new Set(["tenant-owner", "institution-admin", "registrar"]);

function humanize(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function json(value: Readonly<Record<string, unknown>> | undefined): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function nextHref(filters: AuditFilters, cursor: string): Route {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && key !== "cursor" && key !== "limit") params.set(key, String(value));
  }
  params.set("cursor", cursor);
  return `/evidence?${params.toString()}` as Route;
}

export function EvidenceRoom({ page, filters, session }: { page: AuditEventPage; filters: AuditFilters; session: WorkspaceSession }) {
  const canManageExports = session.membership.roles.some((role) => exportManagerRoles.has(role));
  return <section className="workspace evidence-room" aria-labelledby="evidence-title">
    <header className="evidence-heading">
      <div>
        <p className="eyebrow">IMMUTABLE TENANT EVIDENCE</p>
        <h1 id="evidence-title">Evidence room</h1>
        <p>Review consequential actions inside the verified <strong>{session.tenant.displayName}</strong> boundary. This surface is read-only.</p>
      </div>
      <div className="evidence-heading-actions">
        {canManageExports ? <Link className="evidence-export-link" href="/evidence/exports">Governed exports</Link> : null}
        <div className="evidence-trust"><span aria-hidden="true">✓</span><div><strong>Tenant scoped</strong><small>Cursor paginated · immutable</small></div></div>
      </div>
    </header>

    <div className="evidence-layout">
      <aside className="evidence-filters" aria-label="Audit filters">
        <div><p className="eyebrow">FILTER EVIDENCE</p><h2>Find an action</h2></div>
        <form method="get" action="/evidence">
          <label>Event type<input name="eventType" defaultValue={filters.eventType} placeholder="tenant.activated"/></label>
          <label>Resource type<input name="resourceType" defaultValue={filters.resourceType} placeholder="institution"/></label>
          <label>Resource ID<input name="resourceId" defaultValue={filters.resourceId} placeholder="UUID or domain identifier"/></label>
          <label>Actor ID<input name="actorId" defaultValue={filters.actorId} placeholder="User UUID"/></label>
          <div className="evidence-date-row"><label>From date<input type="date" name="from" defaultValue={filters.from}/></label><label>Through date<input type="date" name="to" defaultValue={filters.to}/></label></div>
          <div className="evidence-filter-actions"><button type="submit">Apply filters</button><Link href="/evidence">Clear</Link></div>
        </form>
        <div className="evidence-boundary"><strong>Evidence boundary</strong><p>Actor, resource, correlation and before/after facts are returned only through the selected membership and tenant RLS context.</p></div>
      </aside>

      <section className="evidence-stream" aria-label="Audit event stream">
        <div className="evidence-stream-heading"><div><p className="eyebrow">EVENT STREAM</p><h2>{page.items.length === 0 ? "No matching evidence" : `${page.items.length} events loaded`}</h2></div><span>{page.page.limit} per page</span></div>
        {page.items.length === 0 ? <div className="evidence-empty"><span aria-hidden="true">◎</span><h3>No events match these filters</h3><p>Clear one or more filters, or verify that the action occurred inside this institution workspace.</p></div> : <ol className="evidence-list">
          {page.items.map((item) => <li key={item.id} className="evidence-event">
            <div className={`evidence-plane ${item.plane}`}>{item.plane === "control" ? "CP" : "AP"}</div>
            <article>
              <header><div><p>{humanize(item.eventType)}</p><h3>{item.resource.type} <code>{item.resource.id}</code></h3></div><time dateTime={item.occurredAt}>{dateTime(item.occurredAt, session.membership.timezone)}</time></header>
              <dl><div><dt>Actor</dt><dd><code>{item.actorId}</code></dd></div><div><dt>Correlation</dt><dd><code>{item.correlationId}</code></dd></div>{item.purpose ? <div><dt>Purpose</dt><dd>{item.purpose}</dd></div> : null}</dl>
              <details><summary>Inspect recorded evidence</summary><div className="evidence-json-grid"><section><h4>Before</h4><pre>{json(item.changes.before)}</pre></section><section><h4>After</h4><pre>{json(item.changes.after)}</pre></section><section><h4>Metadata</h4><pre>{json(item.metadata)}</pre></section></div></details>
            </article>
          </li>)}
        </ol>}
        {page.page.nextCursor ? <div className="evidence-pagination"><Link href={nextHref(filters, page.page.nextCursor)}>Load older evidence <span aria-hidden="true">→</span></Link></div> : null}
      </section>
    </div>
  </section>;
}
