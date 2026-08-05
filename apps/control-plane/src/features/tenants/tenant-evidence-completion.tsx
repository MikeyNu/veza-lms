"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TenantOperationsDetail } from "../../server/control-plane-operations-api";

type Row = Readonly<Record<string, unknown>>;
function field<T = unknown>(row: Row | undefined, key: string): T | undefined { return row?.[key] as T | undefined; }
function text(row: Row | undefined, key: string): string { const value = field(row, key); return value === null || value === undefined ? "" : String(value); }
function number(row: Row | undefined, key: string): number { const value = Number(field(row, key) ?? 0); return Number.isFinite(value) ? value : 0; }
function date(value: unknown): string { if (!value || Number.isNaN(Date.parse(String(value)))) return "Not recorded"; return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(String(value))); }
function human(value: string): string { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

async function mutate(operation: string, body: Readonly<Record<string, unknown>>) {
  const response = await fetch(`/api/operations/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `tenant-evidence-${crypto.randomUUID()}` },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Tenant evidence operation failed");
  return result;
}

export function TenantEvidenceCompletion({ detail }: { detail: TenantOperationsDetail }) {
  const router = useRouter();
  const tenant = detail.tenant;
  const tenantId = text(tenant, "id");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const pendingExports = detail.exportReceipts.filter((item) => ["requested", "processing"].includes(text(item, "status")));
  const cancellableDeletions = detail.deletionSchedules.filter((item) => ["scheduled", "blocked-by-hold"].includes(text(item, "state")));

  async function run(operation: string, body: Readonly<Record<string, unknown>>, success: string) {
    setBusy(operation); setError(undefined); setMessage(undefined);
    try { await mutate(operation, body); setMessage(success); router.refresh(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tenant evidence operation failed"); return false; }
    finally { setBusy(undefined); }
  }

  async function health(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    let usageSummary: Record<string, unknown>;
    try { usageSummary = JSON.parse(String(data.get("usageSummary") ?? "{}")) as Record<string, unknown>; }
    catch { setError("Usage summary must be valid JSON."); return; }
    await run(`tenant:${tenantId}:health`, {
      healthStatus: String(data.get("healthStatus")),
      healthSummary: String(data.get("healthSummary") ?? "") || undefined,
      usageSummary,
      expectedProfileVersion: number(tenant, "profileVersion"),
      reason: String(data.get("reason")),
    }, "Tenant health evidence updated.");
  }

  async function completeExport(event: FormEvent<HTMLFormElement>, receiptId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await run(`export:${tenantId}:${receiptId}:complete`, {
      storageReference: String(data.get("storageReference")),
      checksumSha256: String(data.get("checksumSha256")),
      metadata: { completedByWorkflow: String(data.get("workflowReference") ?? "operator-evidence") },
    }, "Tenant export receipt completed.")) form.reset();
  }

  async function cancelDeletion(scheduleId: string) {
    const reason = window.prompt("Record why this tenant deletion schedule is being cancelled.");
    if (!reason || reason.trim().length < 10) { setError("A cancellation reason of at least 10 characters is required."); return; }
    await run(`deletion:${tenantId}:${scheduleId}:cancel`, { reason }, "Tenant deletion schedule cancelled.");
  }

  return <section className="tenant-operations tenant-evidence-completion" aria-labelledby="tenant-evidence-title">
    <header className="tenant-operations-heading compact-heading"><div><p className="cp-eyebrow">OPERATIONAL EVIDENCE COMPLETION</p><h2 id="tenant-evidence-title">Health, export receipts and deletion controls</h2></div><Link href="/support">Open global support and incidents</Link></header>
    {error ? <p className="tenant-operation-feedback error" role="alert">{error}</p> : null}
    {message ? <p className="tenant-operation-feedback success" role="status">{message}</p> : null}

    <section className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">TENANT HEALTH</p><h2>Current service state</h2></div><span>Profile version {number(tenant, "profileVersion")}</span></header>
      <form className="tenant-operation-form" onSubmit={health}>
        <div className="tenant-form-grid"><label>Health state<select name="healthStatus" defaultValue={text(tenant, "healthStatus") || "unknown"}><option value="unknown">Unknown</option><option value="healthy">Healthy</option><option value="degraded">Degraded</option><option value="critical">Critical</option><option value="maintenance">Maintenance</option></select></label><label>Last health check<input value={date(field(tenant, "lastHealthCheckAt"))} readOnly/></label></div>
        <label>Health summary<textarea name="healthSummary" defaultValue={text(tenant, "healthSummary")} maxLength={1000}/></label>
        <label>Usage summary JSON<textarea name="usageSummary" defaultValue={JSON.stringify(field(tenant, "usageSummary") ?? {}, null, 2)}/></label>
        <label>Operational reason<textarea name="reason" required minLength={10}/></label>
        <button disabled={busy === `tenant:${tenantId}:health`}>Update health evidence</button>
      </form>
    </section>

    <section className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">EXPORT RECEIPTS</p><h2>Complete export evidence</h2></div><span>{pendingExports.length} pending</span></header>
      <div className="tenant-evidence-grid">{pendingExports.map((receipt) => <form className="tenant-operation-form compact" key={text(receipt, "id")} onSubmit={(event) => completeExport(event, text(receipt, "id"))}><h3>{human(text(receipt, "exportType"))}</h3><p className="tenant-operation-note">Requested {date(field(receipt, "requestedAt"))} · receipt {text(receipt, "id")}</p><label>Storage reference<input name="storageReference" required placeholder="s3://controlled-export-bucket/path"/></label><label>SHA-256 checksum<input name="checksumSha256" required pattern="[a-f0-9]{64}"/></label><label>Workflow reference<input name="workflowReference" required placeholder="export-job-123"/></label><button disabled={Boolean(busy)}>Complete receipt</button></form>)}</div>
      {pendingExports.length === 0 ? <p className="tenant-operation-note">There are no requested or processing exports awaiting completion evidence.</p> : null}
    </section>

    <section className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">DELETION SCHEDULES</p><h2>Cancellation and retention state</h2></div><span>{cancellableDeletions.length} cancellable</span></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Schedule</th><th>State</th><th>Scheduled for</th><th>Export receipt</th><th>Reason</th><th>Action</th></tr></thead><tbody>{detail.deletionSchedules.map((item) => <tr key={text(item, "id")}><td><code>{text(item, "id")}</code></td><td><span className={`tenant-operation-status ${text(item, "state")}`}>{human(text(item, "state"))}</span></td><td>{date(field(item, "scheduledFor"))}</td><td><code>{text(item, "exportReceiptId")}</code></td><td>{text(item, "reason")}</td><td>{["scheduled", "blocked-by-hold"].includes(text(item, "state")) ? <button className="danger" onClick={() => cancelDeletion(text(item, "id"))}>Cancel schedule</button> : "No action"}</td></tr>)}</tbody></table></div>
    </section>

    <section className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">TENANT SECURITY TRAIL</p><h2>Related incidents</h2></div><Link href="/support">Manage incidents</Link></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Incident</th><th>Severity</th><th>State</th><th>Summary</th><th>Reported</th></tr></thead><tbody>{detail.securityIncidents.map((item) => <tr key={text(item, "id")}><td><strong>{text(item, "incidentKey")}</strong><small>{text(item, "category")}</small></td><td><span className={`tenant-operation-status ${text(item, "severity")}`}>{human(text(item, "severity"))}</span></td><td><span className={`tenant-operation-status ${text(item, "state")}`}>{human(text(item, "state"))}</span></td><td>{text(item, "summary")}</td><td>{date(field(item, "reportedAt"))}</td></tr>)}</tbody></table></div>
    </section>
  </section>;
}
