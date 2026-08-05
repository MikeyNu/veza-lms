import Link from "next/link";
import type { DeadLetterEventView, DeadLetterFilters, DeadLetterPage } from "../../server/dead-letter-api";
import { RequeueDeadLetterForm } from "./requeue-dead-letter-form";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function formatAge(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function shortId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function humanize(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function queryFor(filters: DeadLetterFilters, additions: Readonly<Record<string, string | undefined>> = {}): URLSearchParams {
  const query = new URLSearchParams();
  if (filters.tenantId) query.set("tenantId", filters.tenantId);
  if (filters.eventName) query.set("eventName", filters.eventName);
  if (filters.aggregateType) query.set("aggregateType", filters.aggregateType);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.cursor) query.set("cursor", filters.cursor);
  Object.entries(additions).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query;
}

export function DeadLetterQueue({
  queue,
  filters,
  selected,
}: {
  queue: DeadLetterPage;
  filters: DeadLetterFilters;
  selected?: DeadLetterEventView;
}) {
  const uniqueTenants = new Set(queue.items.map((event) => event.tenantId)).size;
  const highestAttempts = queue.items.reduce((maximum, event) => Math.max(maximum, event.attempts), 0);
  const oldest = queue.items.reduce<DeadLetterEventView | undefined>((current, event) => {
    if (!current) return event;
    return Date.parse(event.deadLetteredAt) < Date.parse(current.deadLetteredAt) ? event : current;
  }, undefined);
  const returnQuery = queryFor(filters);
  const returnSearch = returnQuery.toString();
  const returnHref = returnSearch ? `/delivery-failures?${returnSearch}` : "/delivery-failures";
  const nextQuery = queryFor(filters, { cursor: queue.page.nextCursor });

  return (
    <section className="failure-queue" aria-labelledby="failure-title">
      <header className="failure-heading">
        <div>
          <p className="cp-eyebrow">EVENT DELIVERY CONTROL</p>
          <h1 id="failure-title">Delivery recovery</h1>
          <p>Inspect exhausted domain-event deliveries and requeue only after the transport or downstream dependency has been verified.</p>
        </div>
        <Link href="/health" className="failure-health-link">View service health <span aria-hidden="true">→</span></Link>
      </header>

      <section className="failure-summary" aria-label="Current recovery queue summary">
        <div><small>Exhausted events</small><strong>{queue.items.length}</strong><span>Current result page</span></div>
        <div><small>Affected tenants</small><strong>{uniqueTenants}</strong><span>Operational identifiers only</span></div>
        <div><small>Highest attempts</small><strong>{highestAttempts}</strong><span>Before dead-letter state</span></div>
        <div><small>Oldest failure</small><strong>{oldest ? formatAge(oldest.deadLetteredAt) : "—"}</strong><span>{oldest ? formatDate(oldest.deadLetteredAt) : "Queue clear"}</span></div>
      </section>

      <form className="failure-filters" method="get" action="/delivery-failures">
        <label>Tenant ID<input name="tenantId" defaultValue={filters.tenantId} placeholder="UUID"/></label>
        <label>Event name<input name="eventName" defaultValue={filters.eventName} placeholder="identity.membership-invitation.requested"/></label>
        <label>Aggregate type<input name="aggregateType" defaultValue={filters.aggregateType} placeholder="membership-invitation"/></label>
        <label>From<input type="date" name="from" defaultValue={filters.from}/></label>
        <label>To<input type="date" name="to" defaultValue={filters.to}/></label>
        <div className="failure-filter-actions"><button type="submit">Apply</button><Link href="/delivery-failures">Clear</Link></div>
      </form>

      {queue.items.length === 0 ? (
        <section className="failure-empty">
          <span aria-hidden="true">✓</span>
          <div><h2>No exhausted deliveries</h2><p>No unpublhed outbox events match the selected recovery filters.</p></div>
        </section>
      ) : (
        <div className="failure-workspace">
          <main className="failure-list-panel">
            <div className="failure-list-heading">
              <div><p className="cp-eyebrow">RECOVERY QUEUE</p><h2>Events requiring operator review</h2></div>
              <span>{queue.items.length} shown</span>
            </div>
            <div className="failure-table-wrap">
              <table className="failure-table">
                <thead><tr><th>Event</th><th>Tenant</th><th>Aggregate</th><th>Attempts</th><th>Exhausted</th></tr></thead>
                <tbody>{queue.items.map((event) => {
                  const eventQuery = queryFor(filters, { event: event.id });
                  return (
                    <tr className={selected?.id === event.id ? "selected" : undefined} key={event.id}>
                      <td><Link href={`/delivery-failures?${eventQuery.toString()}`}><strong>{event.eventName}</strong><small>{humanize(event.failureCode)}</small></Link></td>
                      <td><code title={event.tenantId}>{shortId(event.tenantId)}</code></td>
                      <td><strong>{event.aggregate.type}</strong><small title={event.aggregate.id}>{shortId(event.aggregate.id)} ·v {event.aggregate.version}</small></td>
                      <td><em>{event.attempts}</em></td>
                      <td><time dateTime={event.deadLetteredAt}>{formatDate(event.deadLetteredAt)}</time></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {queue.page.nextCursor ? <div className="failure-pagination"><Link href={`/delivery-failures?${nextQuery.toString()}`}>View older failures <span aria-hidden="true">→</span></Link></div> : null}
          </main>

          <aside className="failure-inspector" aria-label="Selected failed event">
            {selected ? (
              <>
                <header className="failure-inspector-heading">
                  <div><p className="cp-eyebrow">SELECTED EVENT</p><h2>{selected.eventName}</h2></div>
                  <span>{selected.attempts} attempts</span>
                </header>
                <div className="failure-state-note"><strong>{humanize(selected.failureCode)}</strong><p>The transport exhausted its configured retry policy at {formatDate(selected.deadLetteredAt)}.</p></div>
                <dl className="failure-details">
                  <div><dt>Event ID</dt><dd><code>{selected.id}</code></dd></div>
                  <div><dt>Tenant ID</dt><dd><code>{selected.tenantId}</code></dd></div>
                  <div><dt>Aggregate</dt><dd>{selected.aggregate.type}</dd></div>
                  <div><dt>Aggregate ID</dt><dd><code>{selected.aggregate.id}</code></dd></div>
                  <div><dt>Aggregate version</dt><dd>{selected.aggregate.version}</dd></div>
                  <div><dt>Event schema</dt><dd>v{selected.eventVersion}</dd></div>
                  <div><dt>Occurred</dt><dd>{formatDate(selected.occurredAt)}</dd></div>
                  <div><dt>Dead-lettered</dt><dd>{formatDate(selected.deadLetteredAt)}</dd></div>
                </dl>
                <RequeueDeadLetterForm eventId={selected.id} returnHref={returnHref}/>
                <div className="failure-boundary"><strong>Payload boundary enforced</strong><p>The event body is never queried or rendered in this workspace. Recovery changes delivery state only.</p></div>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
