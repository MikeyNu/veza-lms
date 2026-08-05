"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ObservabilityOverview } from "../../server/observability-api";

type Row = Readonly<Record<string, unknown>>;

function field<T = unknown>(row: Row | undefined, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key] as T;
  }
  return undefined;
}

function text(row: Row | undefined, ...keys: string[]): string {
  const value = field(row, ...keys);
  return value === undefined ? "" : String(value);
}

function number(row: Row | undefined, ...keys: string[]): number {
  const value = Number(field(row, ...keys) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function formatDate(value: unknown): string {
  if (!value || !Number.isFinite(Date.parse(String(value)))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(String(value)));
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(value >= 0.99 ? 3 : 2)}%`;
}

function Severity({ value }: { value: string }) {
  return <span className={`observability-severity ${value || "unknown"}`}>{value || "unknown"}</span>;
}

async function mutate(
  operation: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/observability/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Observability change failed");
  return result;
}

export function ObservabilityDashboard({ overview }: { overview: ObservabilityOverview }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const measurements = useMemo(
    () => new Map(overview.sloMeasurements.map((row) => [text(row, "sloDefinitionId"), row])),
    [overview.sloMeasurements],
  );
  const activeAlerts = overview.alertEvents.filter((event) => text(event, "state") !== "resolved");
  const openErrors = overview.errors.filter((item) => ["open", "acknowledged"].includes(text(item, "state")));
  const staleRuntimes = overview.heartbeats.filter((heartbeat) => number(heartbeat, "ageSeconds") > 120).length;
  const breachedSlos = overview.sloDefinitions.filter((definition) => {
    const measurement = measurements.get(text(definition, "id"));
    return measurement && number(measurement, "achieved") < number(definition, "objective");
  }).length;
  const totalBacklog = Object.values(overview.backlog).reduce((sum, value) => sum + Number(value ?? 0), 0);

  async function run(operation: string, body: Readonly<Record<string, unknown>>) {
    setBusy(operation);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await mutate(operation, body);
      router.refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Observability change failed");
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }

  async function createSlo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    let queryDefinition: Record<string, unknown>;
    try {
      queryDefinition = JSON.parse(String(values.get("queryDefinition") ?? "{}")) as Record<string, unknown>;
    } catch {
      setError("SLO query definition must be valid JSON.");
      return;
    }
    const result = await run("slo-create", {
      serviceName: String(values.get("serviceName") ?? ""),
      sloKey: String(values.get("sloKey") ?? ""),
      displayName: String(values.get("displayName") ?? ""),
      indicatorType: String(values.get("indicatorType") ?? "availability"),
      objective: Number(values.get("objective") ?? 0.999),
      windowDays: Number(values.get("windowDays") ?? 30),
      latencyThresholdMs: values.get("latencyThresholdMs") ? Number(values.get("latencyThresholdMs")) : undefined,
      queryDefinition,
    });
    if (result) {
      setMessage("SLO definition created. The scheduled measurement worker will collect evidence.");
      form.reset();
    }
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    let condition: Record<string, unknown>;
    try {
      condition = JSON.parse(String(values.get("condition") ?? "{}")) as Record<string, unknown>;
    } catch {
      setError("Alert condition must be valid JSON.");
      return;
    }
    const result = await run("rule-create", {
      alertKey: String(values.get("alertKey") ?? ""),
      displayName: String(values.get("displayName") ?? ""),
      severity: String(values.get("severity") ?? "warning"),
      conditionType: String(values.get("conditionType") ?? "threshold"),
      condition,
      notificationTopic: String(values.get("notificationTopic") ?? "platform.operations"),
    });
    if (result) {
      setMessage("Alert rule created and included in scheduled evaluation.");
      form.reset();
    }
  }

  async function stateChange(
    operation: string,
    state: string,
    promptText: string,
    successText: string,
  ) {
    const reason = window.prompt(promptText);
    if (!reason || reason.trim().length < 10) {
      setError("An operational reason of at least 10 characters is required.");
      return;
    }
    if (await run(operation, { state, status: state, reason })) setMessage(successText);
  }

  return (
    <section className="observability-dashboard" aria-labelledby="observability-title">
      <header className="observability-heading">
        <div>
          <p className="cp-eyebrow">PLATFORM RELIABILITY</p>
          <h1 id="observability-title">Observability control</h1>
          <p>Inspect runtime evidence, manage SLOs and alert policy, acknowledge incidents and close recurring error fingerprints.</p>
        </div>
        <div className="observability-freshness">
          <strong>Snapshot generated</strong>
          <time dateTime={overview.generatedAt}>{formatDate(overview.generatedAt)}</time>
          <span>All operator changes are written to the platform audit trail.</span>
        </div>
      </header>

      <section className="observability-summary" aria-label="Platform reliability summary">
        <div className={staleRuntimes ? "warning" : "healthy"}><small>Stale runtimes</small><strong>{staleRuntimes}</strong><span>Heartbeat age over 120 seconds</span></div>
        <div className={breachedSlos ? "critical" : "healthy"}><small>SLO breaches</small><strong>{breachedSlos}</strong><span>Latest achieved value below objective</span></div>
        <div className={activeAlerts.length ? "critical" : "healthy"}><small>Active alerts</small><strong>{activeAlerts.length}</strong><span>Firing or acknowledged</span></div>
        <div className={openErrors.length ? "warning" : "healthy"}><small>Open errors</small><strong>{openErrors.length}</strong><span>Aggregated fingerprints</span></div>
        <div className={totalBacklog ? "warning" : "healthy"}><small>Platform backlog</small><strong>{totalBacklog}</strong><span>Events, notifications, media and search</span></div>
      </section>

      {error ? <p className="observability-feedback error" role="alert">{error}</p> : null}
      {message ? <p className="observability-feedback success" role="status">{message}</p> : null}

      <section className="observability-section runtime-section">
        <header><div><p className="cp-eyebrow">RUNTIME HEARTBEATS</p><h2>Deployed processes</h2></div><span>{overview.heartbeats.length} reporting</span></header>
        <div className="runtime-grid">{overview.heartbeats.map((heartbeat) => {
          const age = number(heartbeat, "ageSeconds");
          const runtimeKey = text(heartbeat, "runtimeKey");
          return (
            <article key={runtimeKey} className={age > 120 ? "stale" : undefined}>
              <div className="runtime-title"><div><strong>{runtimeKey}</strong><small>{text(heartbeat, "runtimeType")} · {text(heartbeat, "environment")}</small></div><Severity value={age > 120 ? "stale" : text(heartbeat, "status")}/></div>
              <dl><div><dt>Release</dt><dd>{text(heartbeat, "releaseVersion")}</dd></div><div><dt>Instance</dt><dd><code>{text(heartbeat, "instanceId")}</code></dd></div><div><dt>Last seen</dt><dd>{formatAge(age)} ago</dd></div></dl>
              <div className="runtime-capabilities">{(field<string[]>(heartbeat, "capabilities") ?? []).map((capability) => <span key={capability}>{capability}</span>)}</div>
              <div className="runtime-actions">
                <button type="button" disabled={Boolean(busy)} onClick={() => stateChange(`runtime-status:${runtimeKey}`, "degraded", "Record why this runtime must be marked degraded.", "Runtime marked degraded.")}>Mark degraded</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => stateChange(`runtime-status:${runtimeKey}`, "stopping", "Record why this runtime record is being stopped.", "Runtime marked stopping.")}>Mark stopping</button>
              </div>
            </article>
          );
        })}</div>
      </section>

      <div className="observability-two-column">
        <section className="observability-section slo-section">
          <header><div><p className="cp-eyebrow">SERVICE OBJECTIVES</p><h2>SLO definitions and budgets</h2></div><span>{overview.sloDefinitions.length}</span></header>
          <div className="slo-list">{overview.sloDefinitions.map((definition) => {
            const id = text(definition, "id");
            const measurement = measurements.get(id);
            const achieved = measurement ? number(measurement, "achieved") : 0;
            const objective = number(definition, "objective");
            const budget = measurement ? number(measurement, "errorBudgetRemaining") : 0;
            const status = text(definition, "status");
            return (
              <article key={id}>
                <div className="slo-title"><div><strong>{text(definition, "displayName")}</strong><small>{text(definition, "serviceName")} · {text(definition, "indicatorType")}</small></div><Severity value={status}/></div>
                <div className="slo-measure"><div><small>Achieved</small><strong>{measurement ? percentage(achieved) : "No sample"}</strong></div><div><small>Objective</small><strong>{percentage(objective)}</strong></div><div><small>Error budget</small><strong className={budget < 0 ? "negative" : undefined}>{measurement ? percentage(budget) : "No sample"}</strong></div></div>
                <progress max="1" value={Math.max(0, Math.min(1, achieved / Math.max(objective, .000001)))}/>
                <div className="slo-actions"><span>{number(definition, "windowDays")} day window · measured {formatDate(field(measurement, "measuredAt"))}</span><button type="button" onClick={() => stateChange(`slo-status:${id}`, status === "active" ? "retired" : "active", `Record why this SLO is being ${status === "active" ? "retired" : "reactivated"}.`, `SLO ${status === "active" ? "retired" : "reactivated"}.`)}>{status === "active" ? "Retire" : "Reactivate"}</button></div>
              </article>
            );
          })}</div>
          <form className="observability-create-form" onSubmit={createSlo}>
            <h3>Define service objective</h3>
            <div><label>Service name<input name="serviceName" required placeholder="veza-api"/></label><label>SLO key<input name="sloKey" required placeholder="tenant-read-availability"/></label></div>
            <label>Display name<input name="displayName" required/></label>
            <div><label>Indicator<select name="indicatorType"><option value="availability">Availability</option><option value="latency">Latency</option><option value="freshness">Freshness</option><option value="delivery">Delivery</option></select></label><label>Objective<input name="objective" type="number" min="0.000001" max="1" step="0.000001" defaultValue="0.999"/></label></div>
            <div><label>Window days<input name="windowDays" type="number" min="1" max="90" defaultValue="30"/></label><label>Latency threshold ms<input name="latencyThresholdMs" type="number" min="1"/></label></div>
            <label>Query definition JSON<textarea name="queryDefinition" defaultValue={'{"source":"request_observations","goodStatusBelow":500}'}/></label>
            <button disabled={busy === "slo-create"}>Create SLO</button>
          </form>
        </section>

        <section className="observability-section alert-rule-section">
          <header><div><p className="cp-eyebrow">ALERT POLICY</p><h2>Evaluation rules</h2></div><span>{overview.alertRules.length}</span></header>
          <div className="alert-rule-list">{overview.alertRules.map((rule) => {
            const id = text(rule, "id");
            const status = text(rule, "status");
            return <article key={id}><div><div><strong>{text(rule, "displayName")}</strong><small>{text(rule, "alertKey")} · {text(rule, "conditionType")}</small></div><Severity value={text(rule, "severity")}/></div><code>{JSON.stringify(field(rule, "condition") ?? {})}</code><footer><Severity value={status}/><div><button type="button" onClick={() => stateChange(`rule-status:${id}`, status === "active" ? "paused" : "active", `Record why this rule is being ${status === "active" ? "paused" : "activated"}.`, `Alert rule ${status === "active" ? "paused" : "activated"}.`)}>{status === "active" ? "Pause" : "Activate"}</button>{status !== "retired" ? <button type="button" onClick={() => stateChange(`rule-status:${id}`, "retired", "Record why this alert rule is being retired.", "Alert rule retired.")}>Retire</button> : null}</div></footer></article>;
          })}</div>
          <form className="observability-create-form" onSubmit={createRule}>
            <h3>Create alert rule</h3>
            <div><label>Alert key<input name="alertKey" required placeholder="media.backlog-high"/></label><label>Display name<input name="displayName" required/></label></div>
            <div><label>Severity<select name="severity"><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label><label>Condition type<select name="conditionType"><option value="threshold">Threshold</option><option value="absence">Absence</option><option value="burn-rate">Burn rate</option><option value="dependency">Dependency</option></select></label></div>
            <label>Condition JSON<textarea name="condition" defaultValue={'{"metric":"media_backlog","greaterThan":100,"forSeconds":300}'}/></label>
            <label>Notification topic<input name="notificationTopic" defaultValue="platform.operations" required/></label>
            <button disabled={busy === "rule-create"}>Create rule</button>
          </form>
        </section>
      </div>

      <section className="observability-section incident-section">
        <header><div><p className="cp-eyebrow">INCIDENT OPERATIONS</p><h2>Alert events</h2></div><span>{activeAlerts.length} active</span></header>
        <div className="incident-table-wrap"><table className="incident-table"><thead><tr><th>Alert</th><th>Severity</th><th>Fired</th><th>State</th><th>Operator action</th></tr></thead><tbody>{overview.alertEvents.map((event) => {
          const id = text(event, "id");
          const state = text(event, "state");
          return <tr key={id}><td><strong>{text(event, "displayName")}</strong><small>{text(event, "summary")}</small></td><td><Severity value={text(event, "severity")}/></td><td>{formatDate(field(event, "firedAt"))}</td><td><Severity value={state}/></td><td><div>{state === "firing" ? <button type="button" onClick={() => stateChange(`alert-state:${id}`, "acknowledged", "Record the incident acknowledgement and current owner.", "Alert acknowledged.")}>Acknowledge</button> : null}{state !== "resolved" ? <button type="button" onClick={() => stateChange(`alert-state:${id}`, "resolved", "Record the remediation evidence before resolving this alert.", "Alert resolved.")}>Resolve</button> : <span>Closed {formatDate(field(event, "resolvedAt"))}</span>}</div></td></tr>;
        })}</tbody></table></div>
      </section>

      <section className="observability-section error-section">
        <header><div><p className="cp-eyebrow">ERROR REPORTING</p><h2>Aggregated fingerprints</h2></div><span>{openErrors.length} open</span></header>
        <div className="incident-table-wrap"><table className="incident-table error-table"><thead><tr><th>Error</th><th>Service</th><th>Occurrences</th><th>Last seen</th><th>State</th><th>Operator action</th></tr></thead><tbody>{overview.errors.map((item) => {
          const id = text(item, "id");
          const state = text(item, "state");
          return <tr key={id}><td><strong>{text(item, "errorClass")}</strong><small>{text(item, "messageSummary")}</small><code>{text(item, "errorFingerprint").slice(0, 20)}…</code></td><td>{text(item, "serviceName")}<small>{text(item, "environment")} · {text(item, "releaseVersion")}</small></td><td>{number(item, "occurrenceCount").toLocaleString("en-ZA")}</td><td>{formatDate(field(item, "lastSeenAt"))}</td><td><Severity value={state}/></td><td><div>{state === "open" ? <button type="button" onClick={() => stateChange(`error-state:${id}`, "acknowledged", "Record the investigation owner and acknowledgement context.", "Error fingerprint acknowledged.")}>Acknowledge</button> : null}{!["resolved", "ignored"].includes(state) ? <button type="button" onClick={() => stateChange(`error-state:${id}`, "resolved", "Record the remediation or release that resolved this fingerprint.", "Error fingerprint resolved.")}>Resolve</button> : null}{state !== "ignored" ? <button type="button" onClick={() => stateChange(`error-state:${id}`, "ignored", "Record why this fingerprint is accepted or non-actionable.", "Error fingerprint ignored.")}>Ignore</button> : null}</div></td></tr>;
        })}</tbody></table></div>
      </section>
    </section>
  );
}
