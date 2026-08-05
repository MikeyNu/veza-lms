"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { DeadLetterEventView, DeadLetterFilters, DeadLetterPage } from "../../server/dead-letter-api";

function formatDate(value: string): string { return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)); }
function short(value: string): string { return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value; }

function RequeueAction({ event }: { event: DeadLetterEventView }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  async function submit(input: FormEvent<HTMLFormElement>) {
    input.preventDefault(); setState("submitting"); setMessage("");
    try {
      idempotencyKey.current ??= `requeue:${crypto.randomUUID()}`;
      const response = await fetch(`/api/delivery-failures/${event.id}/requeue`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current }, body: JSON.stringify({ reason }),
      });
      const document = await response.json() as { message?: string };
      if (!response.ok) {
        if (response.status !== 503) idempotencyKey.current = null;
        throw new Error(document.message ?? "Delivery could not be requeued");
      }
      setState("done"); setMessage("Returned to the delivery queue."); router.refresh();
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Delivery could not be requeued"); }
  }
  return <form className="failure-requeue" onSubmit={submit}>
    <label htmlFor={`reason-${event.id}`}>Operational reason</label>
    <textarea id={`reason-${event.id}`} value={reason} onChange={(input) => setReason(input.target.value)} minLength={20} maxLength={500} required placeholder="Reference the incident or verified remediation. Do not paste credentials."/>
    <div><small>{reason.length}/500</small><button disabled={state === "submitting" || state === "done"} type="submit">{state === "submitting" ? "Requeueing…" : state === "done" ? "Requeued" : "Requeue event"}</button></div>
    {message ? <p className={state === "error" ? "failure-message error" : "failure-message success"} role="status">{message}</p> : null}
  </form>;
}

export function DeadLetterQueue({ queue, filters }: { queue: DeadLetterPage; filters: DeadLetterFilters }) {
  const next = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) next.set(key, value); });
  if (queue.page.nextCursor) next.set("cursor", queue.page.nextCursor);
  return <section className="failure-queue" aria-labelledby="failure-title">
    <header className="failure-heading"><div><p className="cp-eyebrow">EVENT DELIVERY CONTROL</p><h1 id="failure-title">Delivery failures</h1><p>Inspect exhausted outbox deliveries and return an event to the queue only after the underlying issue is verified.</p></div><div className="failure-count"><strong>{queue.items.length}</strong><span>shown in this page</span></div></header>
    <form className="failure-filters" method="get"><label>Tenant ID<input name="tenantId" defaultValue={filters.tenantId}/></label><label>Event name<input name="eventName" defaultValue={filters.eventName}/></label><label>Aggregate type<input name="aggregateType" defaultValue={filters.aggregateType}/></label><button type="submit">Apply filters</button><a href="/delivery-failures">Reset</a></form>
    {queue.items.length === 0 ? <section className="failure-empty"><span aria-hidden="true">✓</span><div><h2>No exhausted deliveries</h2><p>The worker has no unpublished events in dead-letter state for the selected filters.</p></div></section> : <div className="failure-list">{queue.items.map((event) => <article className="failure-card" key={event.id}>
      <header><div><p className="cp-eyebrow">{event.failureCode}</p><h2>{event.eventName}</h2></div><em>{event.attempts} attempts</em></header>
      <dl><div><dt>Tenant</dt><dd title={event.tenantId}>{short(event.tenantId)}</dd></div><div><dt>Aggregate</dt><dd>{event.aggregate.type} · {short(event.aggregate.id)} · v{event.aggregate.version}</dd></div><div><dt>Occurred</dt><dd>{formatDate(event.occurredAt)}</dd></div><div><dt>Exhausted</dt><dd>{formatDate(event.deadLetteredAt)}</dd></div><div><dt>Event ID</dt><dd title={event.id}>{short(event.id)}</dd></div><div><dt>Schema</dt><dd>v{event.eventVersion}</dd></div></dl>
      <RequeueAction event={event}/>
    </article>)}</div>}
    {queue.page.nextCursor ? <a className="failure-next" href={`/delivery-failures?${next}`}>View older failures <span aria-hidden="true">→</span></a> : null}
    <aside className="failure-boundary"><strong>Domain-data boundary</strong><p>This surface never reads or renders the event body. Requeueing changes delivery state only; it does not alter the underlying academic transaction.</p></aside>
  </section>;
}
