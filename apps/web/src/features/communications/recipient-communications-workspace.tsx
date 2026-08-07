"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RecipientCommunicationsWorkspace } from "../../server/communications-api";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const item = row[key];
  return item === null || item === undefined ? "" : String(item);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function formatDate(input: unknown, timezone: string): string {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(input));
}

function title(row: Readonly<Record<string, unknown>>): string {
  const content = record(row.content_snapshot);
  const subject = content.subject;
  if (typeof subject === "string" && subject.trim()) return subject.trim();
  return value(row, "template_key")
    .split(".")
    .at(-1)
    ?.replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "Notification";
}

function body(row: Readonly<Record<string, unknown>>): string {
  const content = record(row.content_snapshot);
  const raw = typeof content.body === "string" ? content.body : "";
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stateLabel(row: Readonly<Record<string, unknown>>): string {
  return (value(row, "delivery_state") || value(row, "status") || "pending").replaceAll("-", " ");
}

function preferenceFor(
  preferences: readonly Readonly<Record<string, unknown>>[],
  channel: string,
): Readonly<Record<string, unknown>> | undefined {
  return preferences.find((item) => value(item, "channel") === channel && value(item, "topic_key") === "*")
    ?? preferences.find((item) => value(item, "channel") === channel);
}

async function savePreference(input: Readonly<Record<string, unknown>>) {
  const response = await fetch("/api/communications/preference", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Notification preference could not be saved");
}

export function RecipientCommunicationsWorkspaceView({
  workspace,
  timezone,
  institutionName,
}: {
  workspace: RecipientCommunicationsWorkspace;
  timezone: string;
  institutionName: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const notifications = workspace.notifications;
  const delivered = useMemo(
    () => notifications.filter((item) => ["delivered", "sent", "completed"].includes(value(item, "delivery_state") || value(item, "status"))).length,
    [notifications],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const state = String(form.get("state") ?? "enabled");
    setSaving(true);
    setMessage("Saving your notification preference...");
    try {
      await savePreference({
        topicKey: "*",
        channel: String(form.get("channel") ?? "email"),
        state,
        ...(state === "digest" ? { digestFrequency: String(form.get("digestFrequency") ?? "daily") } : {}),
        quietHours: {
          timezone,
          start: String(form.get("quietStart") ?? "21:00"),
          end: String(form.get("quietEnd") ?? "07:00"),
        },
      });
      setMessage("Notification preference saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification preference could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="vz-recipient-communications" aria-labelledby="recipient-communications-title">
      <header className="vz-recipient-heading">
        <div>
          <p>NOTIFICATIONS</p>
          <h1 id="recipient-communications-title">Updates from {institutionName}</h1>
          <span>Course, assessment, access and institution notices addressed to your current account.</span>
        </div>
        <div className="vz-recipient-counts" aria-label="Notification summary">
          <span><strong>{notifications.length}</strong> recent</span>
          <span><strong>{delivered}</strong> sent</span>
        </div>
      </header>

      <div className="vz-recipient-layout">
        <main className="vz-notification-feed" aria-label="Recent notifications">
          <header>
            <div><h2>Recent notifications</h2><p>Newest activity appears first.</p></div>
            <small>Refreshed {formatDate(workspace.generatedAt, timezone)}</small>
          </header>

          {notifications.length ? (
            <div className="vz-notification-list">
              {notifications.map((notification) => {
                const notificationBody = body(notification);
                const channel = value(notification, "channel");
                const state = stateLabel(notification);
                return (
                  <article key={value(notification, "id")}>
                    <div className="vz-notification-marker" aria-hidden="true" />
                    <div className="vz-notification-copy">
                      <div className="vz-notification-meta">
                        <span>{value(notification, "topic_key").replaceAll(".", " / ")}</span>
                        <time>{formatDate(notification.activity_at ?? notification.created_at, timezone)}</time>
                      </div>
                      <h3>{title(notification)}</h3>
                      {notificationBody ? <p>{notificationBody}</p> : <p>Delivery content is still being prepared.</p>}
                      <footer>
                        <span className={`vz-notification-state ${value(notification, "delivery_state") || value(notification, "status")}`}>{state}</span>
                        {channel ? <span>{channel}</span> : null}
                        {value(notification, "policy") === "required" ? <span>Required notice</span> : null}
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="vz-recipient-empty">
              <h2>No notifications yet</h2>
              <p>Notices addressed to this account will appear here after they are queued by your institution.</p>
            </div>
          )}
        </main>

        <aside className="vz-recipient-preferences" id="notification-preferences" aria-labelledby="notification-preferences-title">
          <header>
            <h2 id="notification-preferences-title">Delivery preferences</h2>
            <p>Set a default for optional notices. Required security, access and academic-result notices can still be delivered.</p>
          </header>

          {["email", "push", "sms"].map((channel) => {
            const preference = preferenceFor(workspace.preferences, channel);
            const quietHours = record(preference?.quiet_hours);
            return (
              <form key={channel} onSubmit={submit}>
                <input type="hidden" name="channel" value={channel} />
                <div className="vz-preference-channel">
                  <strong>{channel === "sms" ? "SMS" : channel[0].toUpperCase() + channel.slice(1)}</strong>
                  <span>{preference ? `Updated ${formatDate(preference.updated_at, timezone)}` : "Using institution default"}</span>
                </div>
                <label>
                  Optional notices
                  <select name="state" defaultValue={value(preference ?? {}, "state") || "enabled"}>
                    <option value="enabled">Send normally</option>
                    <option value="digest">Send as digest</option>
                    <option value="disabled">Do not send</option>
                  </select>
                </label>
                <label>
                  Digest frequency
                  <select name="digestFrequency" defaultValue={value(preference ?? {}, "digest_frequency") || "daily"}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <div className="vz-preference-times">
                  <label>Quiet from<input name="quietStart" type="time" defaultValue={typeof quietHours.start === "string" ? quietHours.start : "21:00"} /></label>
                  <label>Until<input name="quietEnd" type="time" defaultValue={typeof quietHours.end === "string" ? quietHours.end : "07:00"} /></label>
                </div>
                <button type="submit" disabled={saving}>{saving ? "Saving..." : `Save ${channel === "sms" ? "SMS" : channel}`}</button>
              </form>
            );
          })}
          <output aria-live="polite">{message}</output>
        </aside>
      </div>
    </section>
  );
}
