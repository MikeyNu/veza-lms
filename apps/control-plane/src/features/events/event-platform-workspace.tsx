"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  EventPlatformOverview,
  EventSchemaView,
} from "../../server/event-platform-api";

async function mutate(
  operation: string,
  input: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
): Promise<Readonly<Record<string, unknown>>> {
  const response = await fetch(`/api/events/${encodeURIComponent(operation)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Readonly<Record<string, unknown>> & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Event operation failed");
  return body;
}

function text(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function number(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function age(value: string | null): string {
  if (!value) return "Clear";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function EventPlatformWorkspace({
  overview,
  schemas,
}: {
  overview: EventPlatformOverview;
  schemas: readonly EventSchemaView[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const deliveries = useMemo(
    () => overview.recentDeliveries.filter((delivery) => text(delivery, "outbox_event_id")),
    [overview.recentDeliveries],
  );

  async function run(
    operation: string,
    input: Readonly<Record<string, unknown>>,
    idempotencyKey?: string,
  ) {
    setMessage("Applying governed operation...");
    try {
      await mutate(operation, input, idempotencyKey);
      setMessage("Operation completed and audit evidence recorded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Event operation failed");
    }
  }

  async function createSchema(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let payloadSchema: Record<string, unknown>;
    try {
      payloadSchema = JSON.parse(String(data.get("payloadSchema") ?? "{}")) as Record<string, unknown>;
    } catch {
      setMessage("Payload schema must be valid JSON.");
      return;
    }
    await run("schema-create", {
      eventName: String(data.get("eventName") ?? ""),
      majorVersion: Number(data.get("majorVersion") ?? 1),
      minorVersion: Number(data.get("minorVersion") ?? 0),
      ownerContext: String(data.get("ownerContext") ?? ""),
      classification: String(data.get("classification") ?? "internal"),
      compatibility: String(data.get("compatibility") ?? "additive"),
      payloadSchema,
    });
  }

  async function replay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventId) {
      setMessage("Select a delivery before replaying it.");
      return;
    }
    const data = new FormData(event.currentTarget);
    await run(
      `replay:${selectedEventId}`,
      {
        consumerKey: String(data.get("consumerKey") ?? "") || undefined,
        reason: String(data.get("reason") ?? ""),
      },
      crypto.randomUUID(),
    );
  }

  return (
    <section className="event-platform" aria-labelledby="event-platform-title">
      <header className="event-platform-heading">
        <div>
          <p className="cp-eyebrow">EVENT DELIVERY AND BACKGROUND PROCESSING</p>
          <h1 id="event-platform-title">Event platform</h1>
          <p>
            Reconcile transport delivery, consumer lag, schema governance and replay evidence without
            exposing domain payloads to the operator workspace.
          </p>
        </div>
        <span className="event-platform-freshness">
          Evidence refreshed <strong>{formatDate(overview.generatedAt)}</strong>
        </span>
      </header>

      <section className="event-platform-summary" aria-label="Event platform summary">
        <div>
          <small>Transport backlog</small>
          <strong>{overview.summary.backlogCount}</strong>
          <span>Oldest {age(overview.summary.oldestBacklogAt)}</span>
        </div>
        <div>
          <small>Dead letter</small>
          <strong>{overview.summary.deadLetterCount}</strong>
          <span>Exhausted transport attempts</span>
        </div>
        <div>
          <small>Delivered in 24 hours</small>
          <strong>{overview.summary.delivered24h}</strong>
          <span>Provider acknowledgements</span>
        </div>
        <div>
          <small>Registered consumers</small>
          <strong>{overview.consumers.length}</strong>
          <span>{overview.consumers.filter((consumer) => consumer.status === "active").length} active</span>
        </div>
      </section>

      <div className="event-platform-grid">
        <main className="event-platform-register">
          <section className="event-platform-panel">
            <header>
              <div><p className="cp-eyebrow">CONSUMER RECONCILIATION</p><h2>Processing lanes</h2></div>
              <span>Inbox state is replay aware</span>
            </header>
            <div className="event-consumer-table">
              <div className="head"><span>Consumer</span><span>Destination</span><span>Pending</span><span>Dead letter</span><span>Last completion</span><span>Status</span></div>
              {overview.consumers.map((consumer) => (
                <article key={consumer.consumerKey}>
                  <span><strong>{consumer.displayName}</strong><code>{consumer.consumerKey}</code></span>
                  <span>{consumer.destinationType}</span>
                  <span><strong>{consumer.pendingCount}</strong><small>{consumer.oldestPendingAt ? `Oldest ${age(consumer.oldestPendingAt)}` : "Current"}</small></span>
                  <span>{consumer.deadLetterCount}</span>
                  <span>{formatDate(consumer.lastCompletedAt)}</span>
                  <span className={`event-state ${consumer.status}`}>{consumer.status}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="event-platform-panel">
            <header>
              <div><p className="cp-eyebrow">DELIVERY EVIDENCE</p><h2>Recent transport and consumer attempts</h2></div>
              <span>Payloads remain outside this view</span>
            </header>
            <div className="event-delivery-table">
              <div className="head"><span>Event</span><span>Stage</span><span>Destination</span><span>Attempt</span><span>State</span><span>Recorded</span></div>
              {deliveries.map((delivery) => {
                const eventId = text(delivery, "outbox_event_id");
                return (
                  <button
                    type="button"
                    key={text(delivery, "id")}
                    className={selectedEventId === eventId ? "selected" : ""}
                    onClick={() => setSelectedEventId(eventId)}
                  >
                    <span><strong>{text(delivery, "event_name")}</strong><code>{eventId.slice(0, 13)}…</code></span>
                    <span>{text(delivery, "delivery_stage")}</span>
                    <span>{text(delivery, "destination_key")}</span>
                    <span>{number(delivery, "attempt_number")}</span>
                    <span className={`event-state ${text(delivery, "state")}`}>{text(delivery, "state")}</span>
                    <span>{formatDate(delivery.recorded_at)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="event-platform-panel">
            <header>
              <div><p className="cp-eyebrow">SCHEMA REGISTRY</p><h2>Versioned event contracts</h2></div>
              <span>{schemas.length} definitions</span>
            </header>
            <div className="event-schema-table">
              <div className="head"><span>Event</span><span>Version</span><span>Owner</span><span>Compatibility</span><span>Classification</span><span>Status</span><span>Action</span></div>
              {schemas.map((schema) => (
                <article key={schema.id}>
                  <span><strong>{schema.event_name}</strong><code>{schema.id.slice(0, 13)}…</code></span>
                  <span>v{schema.major_version}.{schema.minor_version}</span>
                  <span>{schema.owner_context}</span>
                  <span>{schema.compatibility}</span>
                  <span>{schema.classification}</span>
                  <span className={`event-state ${schema.status}`}>{schema.status}</span>
                  <span className="event-schema-actions">
                    {schema.status === "draft" && !schema.submitted_at ? (
                      <button type="button" onClick={() => run(`schema-submit:${schema.id}`, { expectedVersion: schema.version })}>Submit</button>
                    ) : null}
                    {schema.status === "draft" && schema.submitted_at ? (
                      <button type="button" onClick={() => run(`schema-approve:${schema.id}`, { expectedVersion: schema.version, reason: "Independent review confirmed additive compatibility and data classification." })}>Approve</button>
                    ) : null}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </main>

        <aside className="event-platform-controls">
          <section>
            <p className="cp-eyebrow">CONTROLLED REPLAY</p>
            <h2>Replay a delivery</h2>
            <p>Replay appends a new consumer inbox sequence. Prior processing evidence is retained.</p>
            <form onSubmit={replay}>
              <label>Selected event<input value={selectedEventId} readOnly placeholder="Select a recent delivery" /></label>
              <label>Consumer<select name="consumerKey" defaultValue=""><option value="">All active consumers</option>{overview.consumers.filter((consumer) => consumer.status === "active").map((consumer) => <option value={consumer.consumerKey} key={consumer.consumerKey}>{consumer.displayName}</option>)}</select></label>
              <label>Reason<textarea name="reason" required minLength={10} maxLength={1000} placeholder="Describe the verified recovery condition." /></label>
              <button type="submit">Queue replay</button>
            </form>
          </section>

          <section>
            <p className="cp-eyebrow">CONTRACT GOVERNANCE</p>
            <h2>Register schema</h2>
            <form onSubmit={createSchema}>
              <label>Event name<input name="eventName" required pattern="[a-z][a-z0-9.-]{2,159}" placeholder="catalogue.course.approved" /></label>
              <div className="event-form-row"><label>Major<input name="majorVersion" type="number" min="1" max="99" defaultValue="1" /></label><label>Minor<input name="minorVersion" type="number" min="0" max="999" defaultValue="0" /></label></div>
              <label>Owner context<input name="ownerContext" required placeholder="catalogue" /></label>
              <div className="event-form-row"><label>Classification<select name="classification" defaultValue="internal"><option>public</option><option>internal</option><option>confidential</option><option>restricted</option></select></label><label>Compatibility<select name="compatibility" defaultValue="additive"><option>additive</option><option>backward</option><option>strict</option></select></label></div>
              <label>JSON Schema<textarea name="payloadSchema" required defaultValue={'{"type":"object","additionalProperties":false,"properties":{},"required":[]}'}/></label>
              <button type="submit">Create draft</button>
            </form>
          </section>

          <section className="event-platform-note">
            <strong>Operational boundary</strong>
            <p>Reconciliation exposes identifiers, states, lag and checksums. Event payloads are not rendered in the control plane.</p>
          </section>
          <output aria-live="polite">{message}</output>
        </aside>
      </div>
    </section>
  );
}
