"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer } from "@veza/ui";
import type { CommunicationsWorkspace } from "../../server/communications-api";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const item = row[key];
  return typeof item === "string" ? item : item === null || item === undefined ? "" : String(item);
}

function formatDate(input: unknown): string {
  if (typeof input !== "string" || !Number.isFinite(Date.parse(input))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(input));
}

async function mutate(operation: string, body: Readonly<Record<string, unknown>>) {
  const response = await fetch(`/api/communications/${encodeURIComponent(operation)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Communications operation failed");
  return result;
}

type CommunicationsPanel = "preference" | "template" | "sender" | null;

export function CommunicationsWorkspaceView({
  workspace,
  canAdminister,
}: {
  workspace: CommunicationsWorkspace;
  canAdminister: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<CommunicationsPanel>(null);

  async function run(operation: string, body: Readonly<Record<string, unknown>>): Promise<boolean> {
    setBusy(true);
    setMessage("Saving communications evidence...");
    try {
      await mutate(operation, body);
      setMessage("Communications evidence saved.");
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Communications operation failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function savePreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const state = String(data.get("state") ?? "enabled");
    const saved = await run("preference", {
      topicKey: String(data.get("topicKey") ?? "*"),
      channel: String(data.get("channel") ?? "email"),
      state,
      digestFrequency: state === "digest" ? String(data.get("digestFrequency") ?? "daily") : undefined,
      quietHours: {
        timezone: String(data.get("timezone") ?? "Africa/Johannesburg"),
        start: String(data.get("quietStart") ?? "21:00"),
        end: String(data.get("quietEnd") ?? "07:00"),
      },
    });
    if (saved) setPanel(null);
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await run("template-create", {
      templateKey: String(data.get("templateKey") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
      topicKey: String(data.get("topicKey") ?? ""),
      policy: String(data.get("policy") ?? "optional"),
      defaultChannels: data.getAll("channels").map(String),
      subjectTemplate: String(data.get("subjectTemplate") ?? "") || undefined,
      bodyTemplate: String(data.get("bodyTemplate") ?? ""),
      contentType: String(data.get("contentType") ?? "text/plain"),
      variableSchema: { additionalProperties: true },
    });
    if (saved) setPanel(null);
  }

  async function createSender(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await run("sender-create", {
      channel: String(data.get("channel") ?? "email"),
      providerKey: String(data.get("providerKey") ?? ""),
      senderIdentity: String(data.get("senderIdentity") ?? ""),
      replyTo: String(data.get("replyTo") ?? "") || undefined,
      secretReference: String(data.get("secretReference") ?? ""),
      configuration: { region: String(data.get("region") ?? "af-south-1") },
    });
    if (saved) setPanel(null);
  }

  return (
    <section className="vz-communications-page" aria-labelledby="communications-title">
      <header className="vz-page-heading">
        <div>
          <p>COMMUNICATIONS</p>
          <h1 id="communications-title">Delivery, preferences and sender trust</h1>
          <span>
            Govern notification contracts, verified senders and recipient choices while preserving
            immutable delivery evidence.
          </span>
        </div>
        <small>Refreshed {formatDate(workspace.generatedAt)}</small>
      </header>

      <section className="vz-communications-summary">
        <article><small>Templates</small><strong>{workspace.templates.length}</strong><span>Versioned contracts</span></article>
        <article><small>Verified senders</small><strong>{workspace.senders.filter((item) => value(item, "status") === "active").length}</strong><span>Email, SMS and push</span></article>
        <article><small>Recent deliveries</small><strong>{workspace.recentDeliveries.length}</strong><span>Tenant-safe diagnostics</span></article>
        <article><small>Active suppressions</small><strong>{workspace.activeSuppressions.length}</strong><span>Bounce and complaint safety</span></article>
      </section>

      <section className="vz-communications-actionbar" aria-label="Communications actions">
        <div className="vz-communications-policy">
          <strong>Required notification policy</strong>
          <span>Security, access, assessment release and credential events may bypass optional preferences. Quiet hours and suppression safety still apply where policy permits.</span>
        </div>
        <div className="vz-communications-action-buttons">
          <Button type="button" variant="secondary" onClick={() => setPanel("preference")} disabled={busy}>Preferences</Button>
          {canAdminister ? <Button type="button" variant="secondary" onClick={() => setPanel("template")} disabled={busy}>New template</Button> : null}
          {canAdminister ? <Button type="button" onClick={() => setPanel("sender")} disabled={busy}>Configure sender</Button> : null}
        </div>
      </section>
      {message ? <output className="vz-communications-feedback" aria-live="polite">{message}</output> : null}

      <div className="vz-communications-grid">
        <main className="vz-communications-register">
          <section className="vz-record-surface">
            <header><div><p>DELIVERY REGISTER</p><h2>Recent notification evidence</h2></div><span>{workspace.recentDeliveries.length}</span></header>
            <div className="vz-communications-table">
              <div className="head"><span>Template</span><span>Channel</span><span>Provider</span><span>State</span><span>Attempts</span><span>Activity</span></div>
              {workspace.recentDeliveries.map((delivery) => (
                <article key={value(delivery, "id")}>
                  <span><strong>{value(delivery, "template_key")}</strong><small>{value(delivery, "topic_key")}</small></span>
                  <span>{value(delivery, "channel")}</span>
                  <span>{value(delivery, "provider_key")}</span>
                  <span className={`vz-status-pill ${value(delivery, "state")}`}>{value(delivery, "state")}</span>
                  <span>{value(delivery, "attempts")}</span>
                  <span>{formatDate(delivery.updated_at)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="vz-record-surface">
            <header><div><p>TEMPLATE LIBRARY</p><h2>Governed notification contracts</h2></div><span>{workspace.templates.length}</span></header>
            {workspace.templates.map((template) => (
              <article key={value(template, "id")}>
                <div><strong>{value(template, "display_name")}</strong><span>{value(template, "template_key")} · {value(template, "topic_key")}</span></div>
                <dl><div><dt>Policy</dt><dd>{value(template, "policy")}</dd></div><div><dt>Active version</dt><dd>{value(template, "active_version_number") || "None"}</dd></div><div><dt>Status</dt><dd>{value(template, "status")}</dd></div></dl>
              </article>
            ))}
          </section>

          <section className="vz-record-surface">
            <header><div><p>SENDER CONFIGURATION</p><h2>Verified tenant identities</h2></div><span>{workspace.senders.length}</span></header>
            {workspace.senders.map((sender) => (
              <article key={value(sender, "id")}>
                <div><strong>{value(sender, "sender_identity")}</strong><span>{value(sender, "provider_key")}</span></div>
                <dl><div><dt>Channel</dt><dd>{value(sender, "channel")}</dd></div><div><dt>Status</dt><dd>{value(sender, "status")}</dd></div><div><dt>Verified</dt><dd>{formatDate(sender.verified_at)}</dd></div></dl>
              </article>
            ))}
          </section>
        </main>
      </div>

      <Drawer
        open={panel === "preference"}
        onClose={() => setPanel(null)}
        title="Notification preferences"
        description="Set topic and channel preferences without leaving the delivery register."
        width="standard"
      >
        <form className="vz-communications-drawer-form" onSubmit={savePreference}>
          <label>Topic<input name="topicKey" defaultValue="*" pattern="[a-z*][a-z0-9.*-]{0,119}" /></label>
          <label>Channel<select name="channel"><option value="email">Email</option><option value="sms">SMS</option><option value="push">Push</option></select></label>
          <label>Preference<select name="state"><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="digest">Digest</option></select></label>
          <label>Digest frequency<select name="digestFrequency"><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <div className="vz-form-row"><label>Quiet start<input name="quietStart" type="time" defaultValue="21:00" /></label><label>Quiet end<input name="quietEnd" type="time" defaultValue="07:00" /></label></div>
          <input type="hidden" name="timezone" value="Africa/Johannesburg" />
          <Button type="submit" loading={busy} disabled={busy}>Save preference</Button>
        </form>
      </Drawer>

      <Drawer
        open={panel === "template"}
        onClose={() => setPanel(null)}
        title="Create notification template"
        description="Create a governed draft notification contract."
        width="standard"
      >
        <form className="vz-communications-drawer-form" onSubmit={createTemplate}>
          <label>Template key<input name="templateKey" required placeholder="learning.assignment-reminder" /></label>
          <label>Display name<input name="displayName" required /></label>
          <label>Topic key<input name="topicKey" required placeholder="learning.assignments" /></label>
          <label>Policy<select name="policy"><option value="optional">Optional</option><option value="required">Required</option></select></label>
          <fieldset><legend>Default channels</legend><label><input type="checkbox" name="channels" value="email" defaultChecked /> Email</label><label><input type="checkbox" name="channels" value="sms" /> SMS</label><label><input type="checkbox" name="channels" value="push" /> Push</label></fieldset>
          <label>Subject<input name="subjectTemplate" /></label>
          <label>Body<textarea name="bodyTemplate" required placeholder="Hello {{learnerName}}" /></label>
          <label>Content type<select name="contentType"><option value="text/plain">Plain text</option><option value="text/html">HTML</option><option value="application/json">JSON</option></select></label>
          <Button type="submit" loading={busy} disabled={busy}>Create draft</Button>
        </form>
      </Drawer>

      <Drawer
        open={panel === "sender"}
        onClose={() => setPanel(null)}
        title="Configure sender"
        description="Create a pending sender identity for provider verification."
        width="standard"
      >
        <form className="vz-communications-drawer-form" onSubmit={createSender}>
          <label>Channel<select name="channel"><option value="email">Email</option><option value="sms">SMS</option><option value="push">Push</option></select></label>
          <label>Provider key<input name="providerKey" required placeholder="http-email" /></label>
          <label>Sender identity<input name="senderIdentity" required placeholder="notifications@example.edu" /></label>
          <label>Reply to<input name="replyTo" type="email" /></label>
          <label>Secret reference<input name="secretReference" required placeholder="arn:aws:secretsmanager:..." /></label>
          <input type="hidden" name="region" value="af-south-1" />
          <Button type="submit" loading={busy} disabled={busy}>Create pending sender</Button>
        </form>
      </Drawer>
    </section>
  );
}
