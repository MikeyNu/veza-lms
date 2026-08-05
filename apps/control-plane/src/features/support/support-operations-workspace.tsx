"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SupportOperationsOverview } from "../../server/control-plane-operations-api";
import type { TenantFleetItem } from "../../server/tenant-fleet-api";

type Row = Readonly<Record<string, unknown>>;

function field<T = unknown>(row: Row | undefined, key: string): T | undefined {
  return row?.[key] as T | undefined;
}
function text(row: Row | undefined, key: string): string {
  const value = field(row, key);
  return value === null || value === undefined ? "" : String(value);
}
function date(value: unknown): string {
  if (!value || Number.isNaN(Date.parse(String(value)))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(String(value)));
}
function human(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function Pill({ value }: { value: string }) {
  return <span className={`support-pill ${value || "unknown"}`}>{human(value || "unknown")}</span>;
}
function scopes(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}
function splitScopes(value: FormDataEntryValue | null): string[] {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

async function mutate(operation: string, body: Readonly<Record<string, unknown>>) {
  const response = await fetch(`/api/operations/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `support-${crypto.randomUUID()}` },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Support operation failed");
  return result;
}

export function SupportOperationsWorkspace({ support, tenants }: { support: SupportOperationsOverview; tenants: readonly TenantFleetItem[] }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const activeSessions = support.sessions.filter((item) => text(item, "state") === "active" && Date.parse(text(item, "expiresAt")) > Date.now());
  const pendingCases = support.cases.filter((item) => text(item, "state") === "awaiting-customer-approval");
  const openIncidents = support.incidents.filter((item) => !["resolved", "closed"].includes(text(item, "state")));

  async function run(operation: string, body: Readonly<Record<string, unknown>>, success: string) {
    setBusy(operation); setError(undefined); setMessage(undefined);
    try { await mutate(operation, body); setMessage(success); router.refresh(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Support operation failed"); return false; }
    finally { setBusy(undefined); }
  }

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await run("support:create", {
      tenantId: String(data.get("tenantId")), title: String(data.get("title")), purpose: String(data.get("purpose")),
      requestedScope: splitScopes(data.get("requestedScope")), severity: String(data.get("severity")),
      customerContact: { name: String(data.get("customerName")), email: String(data.get("customerEmail")) },
    }, "Support case created. Customer approval is required before elevation.")) form.reset();
  }

  async function approval(event: FormEvent<HTMLFormElement>, caseId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await run(`support:${caseId}:approval`, {
      decision: String(data.get("decision")), customerApproverName: String(data.get("approverName")),
      customerApproverEmail: String(data.get("approverEmail")), approvalReference: String(data.get("approvalReference")),
      approvedScope: splitScopes(data.get("approvedScope")), expiresAt: new Date(String(data.get("expiresAt"))).toISOString(),
      evidence: { channel: String(data.get("evidenceChannel")), recordedNote: String(data.get("evidenceNote")) },
    }, "Customer approval evidence recorded.")) form.reset();
  }

  async function elevation(event: FormEvent<HTMLFormElement>, caseId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await run(`support:${caseId}:elevation`, {
      approvalId: String(data.get("approvalId")), grantedScope: splitScopes(data.get("grantedScope")),
      durationMinutes: Number(data.get("durationMinutes")), reason: String(data.get("reason")),
    }, "Assisted support session started. Customer-facing indicator is active.")) form.reset();
  }

  async function terminate(sessionId: string) {
    const reason = window.prompt("Record why this assisted support session must end now.");
    if (!reason || reason.trim().length < 10) { setError("A termination reason of at least 10 characters is required."); return; }
    await run(`session:${sessionId}:terminate`, { reason }, "Assisted support session terminated.");
  }

  async function resolve(caseId: string) {
    const resolution = window.prompt("Record the support resolution and customer handback evidence.");
    if (!resolution || resolution.trim().length < 10) { setError("A resolution of at least 10 characters is required."); return; }
    await run(`support:${caseId}:resolve`, { resolution }, "Support case resolved and active sessions terminated.");
  }

  async function incident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await run("incident:create", {
      tenantId: String(data.get("tenantId") ?? "") || undefined,
      supportCaseId: String(data.get("supportCaseId") ?? "") || undefined,
      severity: String(data.get("severity")), category: String(data.get("category")), summary: String(data.get("summary")),
      evidence: { detectionSource: String(data.get("detectionSource")), containmentNote: String(data.get("containmentNote")) },
    }, "Security incident recorded in the global trail.")) form.reset();
  }

  return <section className="support-operations" aria-labelledby="support-title">
    <header className="support-heading"><div><p className="cp-eyebrow">PURPOSE-BOUND SUPPORT</p><h1 id="support-title">Assisted support operations</h1><p>Customer approval, expiring scope and visible assisted-session state are mandatory before tenant access.</p></div><div className="support-generated"><small>Evidence snapshot</small><strong>{date(support.generatedAt)}</strong></div></header>
    <div className="support-boundary"><strong>Tenant content remains closed by default</strong><p>Creating a case does not grant access. Elevation requires recorded customer approval, a bounded scope, MFA and an expiry no longer than eight hours. Every session start, use, termination and expiry is written to evidence.</p></div>
    <section className="support-summary"><article><small>Awaiting approval</small><strong>{pendingCases.length}</strong><span>Customer decision required</span></article><article className={activeSessions.length ? "warning" : undefined}><small>Assisted sessions</small><strong>{activeSessions.length}</strong><span>Currently active</span></article><article className={openIncidents.length ? "critical" : undefined}><small>Open incidents</small><strong>{openIncidents.length}</strong><span>Security trail</span></article><article><small>Total cases</small><strong>{support.cases.length}</strong><span>Loaded evidence</span></article></section>
    {error ? <p className="support-feedback error" role="alert">{error}</p> : null}{message ? <p className="support-feedback success" role="status">{message}</p> : null}

    <div className="support-layout">
      <main>
        <section className="support-panel"><header><div><p className="cp-eyebrow">CASE REGISTER</p><h2>Customer requests and approvals</h2></div><span>{support.cases.length}</span></header><div className="support-case-list">{support.cases.map((item) => {
          const caseId = text(item, "id"); const state = text(item, "state"); const approved = text(item, "latestApprovalDecision") === "approved";
          return <article className="support-case" key={caseId}><header><div><strong>{text(item, "caseKey")}</strong><h3>{text(item, "title")}</h3><small>{text(item, "tenantName")}</small></div><div><Pill value={text(item, "severity")}/><Pill value={state}/></div></header><p>{text(item, "purpose")}</p><div className="support-scope">{scopes(field(item, "requestedScope")).map((scope) => <span key={scope}>{scope}</span>)}</div><dl><div><dt>Created</dt><dd>{date(field(item, "createdAt"))}</dd></div><div><dt>Customer contact</dt><dd>{JSON.stringify(field(item, "customerContact") ?? {})}</dd></div>{text(item, "approvalReference") ? <div><dt>Approval reference</dt><dd>{text(item, "approvalReference")}</dd></div> : null}<div><dt>Approval expiry</dt><dd>{date(field(item, "approvalExpiresAt"))}</dd></div></dl>
            {state === "awaiting-customer-approval" ? <form className="support-inline-form" onSubmit={(event) => approval(event, caseId)}><h4>Record customer decision evidence</h4><div><label>Decision<select name="decision"><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="revoked">Revoked</option></select></label><label>Evidence channel<select name="evidenceChannel"><option value="signed-request">Signed request</option><option value="customer-portal">Customer portal</option><option value="recorded-call">Recorded call</option><option value="verified-email">Verified email</option></select></label></div><div><label>Approver name<input name="approverName" required/></label><label>Approver email<input name="approverEmail" type="email" required/></label></div><label>Approval reference<input name="approvalReference" required/></label><label>Approved scopes<input name="approvedScope" defaultValue={scopes(field(item, "requestedScope")).join(", ")} required/></label><label>Approval expiry<input name="expiresAt" type="datetime-local" required/></label><label>Evidence note<textarea name="evidenceNote" required minLength={10}/></label><button disabled={Boolean(busy)}>Record decision</button></form> : null}
            {approved && ["approved", "active"].includes(state) ? <form className="support-inline-form" onSubmit={(event) => elevation(event, caseId)}><h4>Start approved assisted session</h4><input type="hidden" name="approvalId" value={text(item, "latestApprovalId")}/><label>Granted scopes<input name="grantedScope" defaultValue={scopes(field(item, "approvedScope")).join(", ")} required/></label><label>Duration minutes<input name="durationMinutes" type="number" min="5" max="480" defaultValue="30" required/></label><label>Immediate purpose<textarea name="reason" required minLength={10}/></label><button disabled={Boolean(busy)}>Start assisted session</button></form> : null}
            {!['resolved','cancelled','rejected'].includes(state) ? <footer><button type="button" onClick={() => resolve(caseId)}>Resolve and hand back</button></footer> : null}
          </article>;
        })}</div></section>

        <section className="support-panel"><header><div><p className="cp-eyebrow">ASSISTED SESSION INDICATORS</p><h2>Active and historical elevation</h2></div><span>{support.sessions.length}</span></header><div className="support-table-wrap"><table><thead><tr><th>Indicator</th><th>Tenant and operator</th><th>Scope</th><th>Window</th><th>State</th><th>Action</th></tr></thead><tbody>{support.sessions.map((item) => <tr key={text(item, "id")}><td><strong>{text(item, "assistedSessionIndicator")}</strong><small>{text(item, "caseKey")}</small></td><td>{text(item, "tenantName")}<small>{text(item, "operatorName")} · {text(item, "operatorId")}</small></td><td>{scopes(field(item, "grantedScope")).join(", ")}</td><td>{date(field(item, "startedAt"))}<small>Expires {date(field(item, "expiresAt"))}</small></td><td><Pill value={text(item, "state")}/></td><td>{text(item, "state") === "active" ? <button className="danger" onClick={() => terminate(text(item, "id"))}>Terminate</button> : text(item, "terminationReason") || "Closed"}</td></tr>)}</tbody></table></div></section>

        <section className="support-panel"><header><div><p className="cp-eyebrow">SECURITY INCIDENT TRAIL</p><h2>Containment and investigation register</h2></div><span>{support.incidents.length}</span></header><div className="support-table-wrap"><table><thead><tr><th>Incident</th><th>Tenant</th><th>Severity</th><th>State</th><th>Reported</th><th>Evidence</th></tr></thead><tbody>{support.incidents.map((item) => <tr key={text(item, "id")}><td><strong>{text(item, "incidentKey")}</strong><small>{text(item, "category")}: {text(item, "summary")}</small></td><td>{text(item, "tenantName") || "Platform-wide"}</td><td><Pill value={text(item, "severity")}/></td><td><Pill value={text(item, "state")}/></td><td>{date(field(item, "reportedAt"))}<small>{text(item, "reporterName")}</small></td><td><code>{JSON.stringify(field(item, "evidence") ?? {})}</code></td></tr>)}</tbody></table></div></section>
      </main>

      <aside>
        <form className="support-create-form" onSubmit={createCase}><p className="cp-eyebrow">NEW SUPPORT CASE</p><h2>Request customer-approved assistance</h2><label>Tenant<select name="tenantId" required><option value="">Select institution</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.displayName} · {tenant.slug}</option>)}</select></label><label>Title<input name="title" required/></label><label>Purpose<textarea name="purpose" required minLength={10}/></label><label>Requested scopes<input name="requestedScope" required placeholder="identity.read, enrolment.read"/><small>Comma-separated least-privilege capabilities.</small></label><label>Severity<select name="severity"><option value="normal">Normal</option><option value="high">High</option><option value="security-incident">Security incident</option></select></label><label>Customer contact name<input name="customerName" required/></label><label>Customer contact email<input name="customerEmail" type="email" required/></label><button disabled={Boolean(busy)}>Create support case</button></form>
        <form className="support-create-form incident" onSubmit={incident}><p className="cp-eyebrow">SECURITY EVIDENCE</p><h2>Record incident</h2><label>Tenant<select name="tenantId"><option value="">Platform-wide</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.displayName}</option>)}</select></label><label>Related support case<select name="supportCaseId"><option value="">No related case</option>{support.cases.map((item) => <option key={text(item, "id")} value={text(item, "id")}>{text(item, "caseKey")}</option>)}</select></label><label>Severity<select name="severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Category<input name="category" required placeholder="unauthorised-access"/></label><label>Summary<textarea name="summary" required minLength={10}/></label><label>Detection source<input name="detectionSource" required/></label><label>Containment note<textarea name="containmentNote" required minLength={10}/></label><button disabled={Boolean(busy)}>Record incident</button></form>
      </aside>
    </div>
  </section>;
}
