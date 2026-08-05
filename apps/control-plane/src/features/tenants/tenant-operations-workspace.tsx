"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TenantOperationsDetail } from "../../server/control-plane-operations-api";

type Row = Readonly<Record<string, unknown>>;

function value(row: Row | undefined, key: string): unknown {
  return row?.[key];
}

function text(row: Row | undefined, key: string): string {
  const item = value(row, key);
  return item === null || item === undefined ? "" : String(item);
}

function number(row: Row | undefined, key: string): number {
  const item = Number(value(row, key) ?? 0);
  return Number.isFinite(item) ? item : 0;
}

function date(value: unknown): string {
  if (!value || Number.isNaN(Date.parse(String(value)))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(String(value)));
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function human(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Status({ children }: { children: string }) {
  return <span className={`tenant-operation-status ${children || "unknown"}`}>{human(children || "unknown")}</span>;
}

async function mutate(operation: string, body: Readonly<Record<string, unknown>>) {
  const response = await fetch(`/api/operations/${operation}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `cp-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Control-plane operation failed");
  return result;
}

export function TenantOperationsWorkspace({ detail }: { detail: TenantOperationsDetail }) {
  const router = useRouter();
  const tenant = detail.tenant;
  const tenantId = text(tenant, "id");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const latestUsage = detail.usage[0];
  const activeHold = detail.retentionHolds.find((item) => text(item, "status") === "active");
  const openDeletion = detail.deletionSchedules.find((item) => ["scheduled", "blocked-by-hold", "executing"].includes(text(item, "state")));
  const completedExports = detail.exportReceipts.filter((item) => text(item, "status") === "completed" && text(item, "exportType") === "full-tenant");

  async function run(operation: string, body: Readonly<Record<string, unknown>>, success: string) {
    setBusy(operation);
    setError(undefined);
    setMessage(undefined);
    try {
      await mutate(operation, body);
      setMessage(success);
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Control-plane operation failed");
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function lifecycle(action: string) {
    const reason = window.prompt(`Record the operational reason for ${action}.`);
    if (!reason || reason.trim().length < 10) {
      setError("A reason of at least 10 characters is required.");
      return;
    }
    await run(`tenant:${tenantId}:lifecycle`, {
      action,
      expectedVersion: number(tenant, "operationalVersion"),
      reason,
    }, `Tenant lifecycle changed: ${human(action)}.`);
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let quotaPolicy: Record<string, unknown>;
    let supportContacts: unknown[];
    try {
      quotaPolicy = JSON.parse(String(data.get("quotaPolicy") ?? "{}")) as Record<string, unknown>;
      supportContacts = JSON.parse(String(data.get("supportContacts") ?? "[]")) as unknown[];
    } catch {
      setError("Quota policy and support contacts must be valid JSON.");
      return;
    }
    await run(`tenant:${tenantId}:profile`, {
      expectedVersion: number(tenant, "operationalVersion"),
      deploymentTier: String(data.get("deploymentTier") ?? "shared"),
      residencyRegion: String(data.get("residencyRegion") ?? ""),
      customDomain: String(data.get("customDomain") ?? "") || undefined,
      brandingStatus: String(data.get("brandingStatus") ?? "not-configured"),
      identityProviderStatus: String(data.get("identityProviderStatus") ?? "not-configured"),
      quotaPolicy,
      supportContacts,
      reason: String(data.get("reason") ?? ""),
    }, "Tenant operational profile updated.");
  }

  async function requestExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await run(`tenant:${tenantId}:export`, {
      exportType: String(data.get("exportType")),
      expiresAt: data.get("expiresAt") ? new Date(String(data.get("expiresAt"))).toISOString() : undefined,
      reason: String(data.get("reason")),
    }, "Tenant export requested.")) form.reset();
  }

  async function createHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await run(`tenant:${tenantId}:hold`, {
      holdType: String(data.get("holdType")),
      reason: String(data.get("reason")),
      reference: String(data.get("reference") ?? "") || undefined,
      expiresAt: data.get("expiresAt") ? new Date(String(data.get("expiresAt"))).toISOString() : undefined,
    }, "Retention hold created.")) form.reset();
  }

  async function scheduleDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await run(`tenant:${tenantId}:deletion`, {
      exportReceiptId: String(data.get("exportReceiptId")),
      scheduledFor: new Date(String(data.get("scheduledFor"))).toISOString(),
      reason: String(data.get("reason")),
    }, activeHold ? "Deletion scheduled and blocked by retention hold." : "Tenant deletion scheduled.")) form.reset();
  }

  async function setEntitlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let limits: Record<string, unknown>;
    try { limits = JSON.parse(String(data.get("limits") ?? "{}")) as Record<string, unknown>; }
    catch { setError("Entitlement limits must be valid JSON."); return; }
    if (await run(`tenant:${tenantId}:entitlement`, {
      moduleKey: String(data.get("moduleKey")),
      state: String(data.get("state")),
      limits,
      effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(),
      effectiveUntil: data.get("effectiveUntil") ? new Date(String(data.get("effectiveUntil"))).toISOString() : undefined,
      reason: String(data.get("reason")),
      billingReference: String(data.get("billingReference") ?? "") || undefined,
    }, "Effective-dated entitlement override recorded.")) form.reset();
  }

  async function setThreshold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await run(`tenant:${tenantId}:threshold`, {
      metricKey: String(data.get("metricKey")),
      warningValue: Number(data.get("warningValue")),
      criticalValue: Number(data.get("criticalValue")),
      enforcement: String(data.get("enforcement")),
      effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(),
      effectiveUntil: data.get("effectiveUntil") ? new Date(String(data.get("effectiveUntil"))).toISOString() : undefined,
      reason: String(data.get("reason")),
    }, "Usage threshold recorded.")) form.reset();
  }

  async function setBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await run(`tenant:${tenantId}:billing`, {
      providerKey: String(data.get("providerKey")),
      externalCustomerReference: String(data.get("externalCustomerReference")),
      externalSubscriptionReference: String(data.get("externalSubscriptionReference") ?? "") || undefined,
      billingState: String(data.get("billingState")),
      effectiveFrom: new Date(String(data.get("effectiveFrom"))).toISOString(),
      effectiveUntil: data.get("effectiveUntil") ? new Date(String(data.get("effectiveUntil"))).toISOString() : undefined,
      metadata: {},
      reason: String(data.get("reason")),
    }, "Billing linkage recorded.")) form.reset();
  }

  return <section className="tenant-operations" aria-labelledby="tenant-operations-title">
    <header className="tenant-operations-heading">
      <div>
        <Link href="/tenants" className="tenant-operations-back">← Institution fleet</Link>
        <p className="cp-eyebrow">TENANT LIFECYCLE</p>
        <h1 id="tenant-operations-title">{text(tenant, "displayName")}</h1>
        <p>{text(tenant, "legalName")} · <code>{text(tenant, "slug")}</code></p>
      </div>
      <div className="tenant-operations-identity">
        <Status>{text(tenant, "status")}</Status>
        <span>{human(text(tenant, "deploymentTier"))}</span>
        <span>{text(tenant, "residencyRegion")}</span>
      </div>
    </header>

    <div className="tenant-operations-boundary">
      <strong>Operational metadata boundary</strong>
      <p>This workspace contains tenancy, commercial, release and support evidence only. Learner records, course content, submissions and assessment data remain inaccessible without a customer-approved, expiring support session.</p>
    </div>

    {error ? <p className="tenant-operation-feedback error" role="alert">{error}</p> : null}
    {message ? <p className="tenant-operation-feedback success" role="status">{message}</p> : null}

    <section className="tenant-operation-summary" aria-label="Tenant operational summary">
      <article><small>Health</small><strong>{human(text(tenant, "healthStatus") || "unknown")}</strong><span>{text(tenant, "healthSummary") || "No active health exception"}</span></article>
      <article><small>Plan</small><strong>{text(tenant, "planDisplayName")}</strong><span>{text(tenant, "planKey")}</span></article>
      <article><small>Active learners</small><strong>{number(latestUsage, "activeLearners").toLocaleString("en-ZA")}</strong><span>Latest usage snapshot</span></article>
      <article><small>Storage</small><strong>{bytes(number(latestUsage, "storageBytes"))}</strong><span>Latest usage snapshot</span></article>
      <article className={activeHold ? "warning" : undefined}><small>Retention hold</small><strong>{activeHold ? "Active" : "None"}</strong><span>{activeHold ? human(text(activeHold, "holdType")) : "Deletion not blocked"}</span></article>
      <article className={openDeletion ? "warning" : undefined}><small>Deletion</small><strong>{openDeletion ? human(text(openDeletion, "state")) : "Not scheduled"}</strong><span>{openDeletion ? date(value(openDeletion, "scheduledFor")) : "No open schedule"}</span></article>
    </section>

    <nav className="tenant-operation-index" aria-label="Tenant operation sections">
      <a href="#lifecycle">Lifecycle</a><a href="#configuration">Configuration</a><a href="#offboarding">Offboarding</a><a href="#entitlements">Entitlements</a><a href="#usage">Usage</a><a href="#release">Release</a><a href="#support">Support</a><a href="#history">Evidence</a>
    </nav>

    <section id="lifecycle" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">LIFECYCLE CONTROL</p><h2>Availability and contract state</h2></div><span>Version {number(tenant, "operationalVersion")}</span></header>
      <div className="tenant-lifecycle-actions">
        {text(tenant, "status") === "provisioning" ? <button disabled={Boolean(busy)} onClick={() => lifecycle("activate")}>Activate tenant</button> : null}
        {text(tenant, "status") === "active" ? <button disabled={Boolean(busy)} onClick={() => lifecycle("suspend")}>Suspend access</button> : null}
        {text(tenant, "status") === "suspended" ? <button disabled={Boolean(busy)} onClick={() => lifecycle("resume")}>Resume service</button> : null}
        {["active", "suspended"].includes(text(tenant, "status")) ? <button className="danger" disabled={Boolean(busy)} onClick={() => lifecycle("start-offboarding")}>Start offboarding</button> : null}
        {text(tenant, "status") === "offboarding" ? <button className="danger" disabled={Boolean(busy) || completedExports.length === 0 || !openDeletion} onClick={() => lifecycle("close")}>Close tenant</button> : null}
      </div>
      {text(tenant, "status") === "offboarding" && (completedExports.length === 0 || !openDeletion) ? <p className="tenant-operation-note">Closure remains disabled until a completed full-tenant export and an open deletion schedule are present.</p> : null}
    </section>

    <section id="configuration" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">SERVICE CONFIGURATION</p><h2>Region, deployment, domain and trust status</h2></div></header>
      <form className="tenant-operation-form" onSubmit={updateProfile}>
        <div className="tenant-form-grid three"><label>Deployment tier<select name="deploymentTier" defaultValue={text(tenant, "deploymentTier")}><option value="shared">Shared</option><option value="protected">Protected</option><option value="sovereign">Sovereign</option></select></label><label>Residency region<input name="residencyRegion" defaultValue={text(tenant, "residencyRegion")} required/></label><label>Custom domain<input name="customDomain" defaultValue={text(tenant, "customDomain")} placeholder="learn.institution.ac.za"/></label></div>
        <div className="tenant-form-grid"><label>Branding status<select name="brandingStatus" defaultValue={text(tenant, "brandingStatus")}><option value="not-configured">Not configured</option><option value="draft">Draft</option><option value="verified">Verified</option><option value="action-required">Action required</option></select></label><label>Identity provider status<select name="identityProviderStatus" defaultValue={text(tenant, "identityProviderStatus")}><option value="not-configured">Not configured</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="degraded">Degraded</option><option value="action-required">Action required</option></select></label></div>
        <label>Quota policy JSON<textarea name="quotaPolicy" defaultValue={JSON.stringify(value(tenant, "quotaPolicy") ?? {}, null, 2)}/></label>
        <label>Support contacts JSON<textarea name="supportContacts" defaultValue={JSON.stringify(value(tenant, "supportContacts") ?? [], null, 2)}/><small>Array of name, role, email, phone and primary fields.</small></label>
        <label>Operational reason<textarea name="reason" required minLength={10}/></label>
        <button disabled={busy === `tenant:${tenantId}:profile`}>Save tenant configuration</button>
      </form>
    </section>

    <section id="offboarding" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">OFFBOARDING EVIDENCE</p><h2>Export, retention and deletion</h2></div></header>
      <div className="tenant-operation-columns">
        <form className="tenant-operation-form compact" onSubmit={requestExport}><h3>Request export</h3><label>Export package<select name="exportType"><option value="full-tenant">Full tenant</option><option value="audit">Audit</option><option value="identity">Identity</option><option value="learning-records">Learning records</option><option value="media-manifest">Media manifest</option></select></label><label>Receipt expiry<input name="expiresAt" type="datetime-local"/></label><label>Reason<textarea name="reason" required minLength={10}/></label><button>Request export</button></form>
        <form className="tenant-operation-form compact" onSubmit={createHold}><h3>Create retention hold</h3><label>Hold type<select name="holdType"><option value="legal">Legal</option><option value="security">Security</option><option value="customer-request">Customer request</option><option value="regulatory">Regulatory</option><option value="billing-dispute">Billing dispute</option></select></label><label>Reference<input name="reference"/></label><label>Expiry<input name="expiresAt" type="datetime-local"/></label><label>Reason<textarea name="reason" required minLength={10}/></label><button>Create hold</button></form>
        <form className="tenant-operation-form compact" onSubmit={scheduleDeletion}><h3>Schedule deletion</h3><label>Completed full export<select name="exportReceiptId" required><option value="">Select receipt</option>{completedExports.map((receipt) => <option key={text(receipt, "id")} value={text(receipt, "id")}>{date(value(receipt, "completedAt"))} · {text(receipt, "id").slice(0, 8)}</option>)}</select></label><label>Scheduled time<input name="scheduledFor" type="datetime-local" required/></label><label>Reason<textarea name="reason" required minLength={10}/></label><button disabled={completedExports.length === 0}>Schedule deletion</button></form>
      </div>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Export</th><th>Status</th><th>Requested</th><th>Completed</th><th>Evidence</th></tr></thead><tbody>{detail.exportReceipts.map((receipt) => <tr key={text(receipt, "id")}><td>{human(text(receipt, "exportType"))}<small>{text(receipt, "id")}</small></td><td><Status>{text(receipt, "status")}</Status></td><td>{date(value(receipt, "requestedAt"))}</td><td>{date(value(receipt, "completedAt"))}</td><td>{text(receipt, "checksumSha256") ? <code>{text(receipt, "checksumSha256").slice(0, 16)}…</code> : "Pending"}</td></tr>)}</tbody></table></div>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Retention hold</th><th>Status</th><th>Period</th><th>Operator action</th></tr></thead><tbody>{detail.retentionHolds.map((hold) => <tr key={text(hold, "id")}><td>{human(text(hold, "holdType"))}<small>{text(hold, "reason")}</small></td><td><Status>{text(hold, "status")}</Status></td><td>{date(value(hold, "startsAt"))}<small>Expires {date(value(hold, "expiresAt"))}</small></td><td>{text(hold, "status") === "active" ? <button onClick={async () => { const reason = window.prompt("Record why this hold is being released."); if (reason) await run(`hold:${tenantId}:${text(hold, "id")}:release`, { reason }, "Retention hold released."); }}>Release hold</button> : "Closed"}</td></tr>)}</tbody></table></div>
    </section>

    <section id="entitlements" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">COMMERCIAL ENTITLEMENTS</p><h2>Modules, trials and effective-dated overrides</h2></div><span>{detail.entitlements.length} modules</span></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Module</th><th>Plan state</th><th>Current override</th><th>Effective period</th></tr></thead><tbody>{detail.entitlements.map((item) => <tr key={text(item, "moduleKey")}><td><strong>{human(text(item, "moduleKey"))}</strong></td><td><Status>{text(item, "state")}</Status><small>{JSON.stringify(value(item, "limits") ?? {})}</small></td><td>{text(item, "overrideState") ? <Status>{text(item, "overrideState")}</Status> : "Plan default"}<small>{text(item, "overrideReason")}</small></td><td>{date(value(item, "overrideEffectiveFrom") ?? value(item, "validFrom"))}<small>Until {date(value(item, "overrideEffectiveUntil") ?? value(item, "validUntil"))}</small></td></tr>)}</tbody></table></div>
      <form className="tenant-operation-form" onSubmit={setEntitlement}><h3>Record entitlement override</h3><div className="tenant-form-grid three"><label>Module key<input name="moduleKey" required placeholder="advanced-analytics"/></label><label>State<select name="state"><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="trial">Trial</option></select></label><label>Billing reference<input name="billingReference"/></label></div><label>Limits JSON<textarea name="limits" defaultValue="{}"/></label><div className="tenant-form-grid"><label>Effective from<input name="effectiveFrom" type="datetime-local" required/></label><label>Effective until<input name="effectiveUntil" type="datetime-local"/></label></div><label>Reason<textarea name="reason" required minLength={10}/></label><button>Save entitlement override</button></form>
    </section>

    <section id="usage" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">QUOTA AND USAGE</p><h2>Consumption thresholds and enforcement</h2></div></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Period</th><th>Learners</th><th>Staff</th><th>Storage</th><th>API requests</th><th>Media minutes</th></tr></thead><tbody>{detail.usage.map((item) => <tr key={`${text(item, "periodStart")}:${text(item, "periodEnd")}`}><td>{date(value(item, "periodStart"))}<small>to {date(value(item, "periodEnd"))}</small></td><td>{number(item, "activeLearners").toLocaleString("en-ZA")}</td><td>{number(item, "activeStaff").toLocaleString("en-ZA")}</td><td>{bytes(number(item, "storageBytes"))}</td><td>{number(item, "apiRequests").toLocaleString("en-ZA")}</td><td>{number(item, "mediaMinutes").toLocaleString("en-ZA")}</td></tr>)}</tbody></table></div>
      <div className="tenant-operation-columns two">
        <form className="tenant-operation-form compact" onSubmit={setThreshold}><h3>Set usage threshold</h3><label>Metric key<input name="metricKey" required placeholder="active-learners"/></label><div className="tenant-form-grid"><label>Warning<input name="warningValue" type="number" min="0" required/></label><label>Critical<input name="criticalValue" type="number" min="0" required/></label></div><label>Enforcement<select name="enforcement"><option value="notify">Notify</option><option value="soft-deny">Soft deny</option><option value="hard-deny">Hard deny</option></select></label><div className="tenant-form-grid"><label>Effective from<input name="effectiveFrom" type="datetime-local" required/></label><label>Effective until<input name="effectiveUntil" type="datetime-local"/></label></div><label>Reason<textarea name="reason" required minLength={10}/></label><button>Save threshold</button></form>
        <form className="tenant-operation-form compact" onSubmit={setBilling}><h3>Link billing account</h3><label>Provider key<input name="providerKey" required placeholder="billing-platform"/></label><label>Customer reference<input name="externalCustomerReference" required/></label><label>Subscription reference<input name="externalSubscriptionReference"/></label><label>Billing state<select name="billingState"><option value="linked">Linked</option><option value="trial">Trial</option><option value="past-due">Past due</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></label><div className="tenant-form-grid"><label>Effective from<input name="effectiveFrom" type="datetime-local" required/></label><label>Effective until<input name="effectiveUntil" type="datetime-local"/></label></div><label>Reason<textarea name="reason" required minLength={10}/></label><button>Save billing link</button></form>
      </div>
    </section>

    <section id="release" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">RELEASE POSITION</p><h2>Ring, compatibility and exceptions</h2></div><Link href="/releases">Open release management</Link></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Ring</th><th>Target version</th><th>Assignment</th><th>Tenant exception</th></tr></thead><tbody>{detail.release.map((item, index) => <tr key={`${text(item, "ringKey")}:${index}`}><td>{text(item, "displayName")}<small>{text(item, "ringKey")}</small></td><td>{text(item, "targetVersion") || "Not targeted"}</td><td>{date(value(item, "effectiveFrom"))}<small>Until {date(value(item, "effectiveUntil"))}</small></td><td>{text(item, "pinnedVersion") || "None"}<small>{text(item, "exceptionReason")}</small></td></tr>)}</tbody></table></div>
    </section>

    <section id="support" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">ASSISTED SUPPORT</p><h2>Purpose-bound customer-approved access</h2></div><Link href="/support">Open support operations</Link></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Case</th><th>Purpose</th><th>State</th><th>Scope</th><th>Created</th></tr></thead><tbody>{detail.supportCases.map((item) => <tr key={text(item, "id")}><td><strong>{text(item, "caseKey")}</strong><small>{text(item, "title")}</small></td><td>{text(item, "purpose")}</td><td><Status>{text(item, "state")}</Status></td><td>{(value(item, "requestedScope") as string[] | undefined)?.join(", ")}</td><td>{date(value(item, "createdAt"))}</td></tr>)}</tbody></table></div>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Assisted session</th><th>Operator</th><th>Scope</th><th>State</th><th>Expiry</th></tr></thead><tbody>{detail.supportSessions.map((item) => <tr key={text(item, "id")}><td><strong>{text(item, "assistedSessionIndicator")}</strong><small>{text(item, "caseKey")}</small></td><td><code>{text(item, "operatorId")}</code></td><td>{(value(item, "grantedScope") as string[] | undefined)?.join(", ")}</td><td><Status>{text(item, "state")}</Status></td><td>{date(value(item, "expiresAt"))}</td></tr>)}</tbody></table></div>
    </section>

    <section id="history" className="tenant-operation-section">
      <header><div><p className="cp-eyebrow">IMMUTABLE EVIDENCE</p><h2>Lifecycle, entitlement and denial history</h2></div><Link href="/audit">Open global audit</Link></header>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Lifecycle event</th><th>State change</th><th>Reason</th><th>Occurred</th></tr></thead><tbody>{detail.lifecycle.map((item) => <tr key={text(item, "id")}><td>{human(text(item, "transition"))}</td><td>{text(item, "fromStatus") || "None"} → {text(item, "toStatus") || "No status change"}</td><td>{text(item, "reason")}</td><td>{date(value(item, "occurredAt"))}</td></tr>)}</tbody></table></div>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Module</th><th>Source</th><th>Result</th><th>Reason</th><th>Occurred</th></tr></thead><tbody>{detail.entitlementHistory.map((item) => <tr key={text(item, "id")}><td>{human(text(item, "moduleKey"))}</td><td>{human(text(item, "source"))}</td><td><code>{JSON.stringify(value(item, "resultingState"))}</code></td><td>{text(item, "reason")}</td><td>{date(value(item, "occurredAt"))}</td></tr>)}</tbody></table></div>
      <div className="tenant-operation-table-wrap"><table><thead><tr><th>Denied capability</th><th>Code</th><th>Reason</th><th>Correlation</th><th>Denied</th></tr></thead><tbody>{detail.entitlementDenials.map((item) => <tr key={text(item, "id")}><td>{human(text(item, "moduleKey"))}<small>{text(item, "capabilityKey")}</small></td><td><code>{text(item, "denialCode")}</code></td><td>{text(item, "reasonSummary")}</td><td><code>{text(item, "correlationId")}</code></td><td>{date(value(item, "deniedAt"))}</td></tr>)}</tbody></table></div>
    </section>
  </section>;
}
