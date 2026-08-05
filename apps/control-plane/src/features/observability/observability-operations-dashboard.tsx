"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ObservabilityOverview } from "../../server/observability-api";

type Row = Readonly<Record<string, unknown>>;

function value<T = unknown>(row: Row | undefined, key: string): T | undefined {
  const candidate = row?.[key];
  return candidate === undefined || candidate === null ? undefined : candidate as T;
}

function text(row: Row | undefined, key: string): string {
  const candidate = value(row, key);
  return candidate === undefined ? "" : String(candidate);
}

function numeric(row: Row | undefined, key: string): number {
  const candidate = Number(value(row, key) ?? 0);
  return Number.isFinite(candidate) ? candidate : 0;
}

function date(value: unknown): string {
  if (!value || !Number.isFinite(Date.parse(String(value)))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(String(value)));
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.99 ? 3 : 2)}%`;
}

function age(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function Pill({ value }: { value: string }) {
  return <span className={`observability-pill ${value || "unknown"}`}>{value || "unknown"}</span>;
}

async function post(
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/observability/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Observability operation failed");
  return body;
}

export function ObservabilityOperationsDashboard({
  overview,
}: {
  overview: ObservabilityOverview;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const latestMeasurements = useMemo(
    () => new Map(overview.sloMeasurements.map((measurement) => [
      text(measurement, "sloDefinitionId"),
      measurement,
    ])),
    [overview.sloMeasurements],
  );
  const staleRuntimes = overview.heartbeats.filter((runtime) => numeric(runtime, "ageSeconds") > 120);
  const activeAlerts = overview.alertEvents.filter((alert) => text(alert, "state") !== "resolved");
  const openErrors = overview.errors.filter((report) => ["open", "acknowledged"].includes(text(report, "state")));
  const breachedSlos = overview.sloDefinitions.filter((definition) => {
    const measurement = latestMeasurements.get(text(definition, "id"));
    return measurement && numeric(measurement, "achieved") < numeric(definition, "objective");
  });
  const backlog = Object.values(overview.backlog).reduce((total, item) => total + Number(item ?? 0), 0);

  async function apply(
    operation: string,
    input: Readonly<Record<string, unknown>>,
    success: string,
  ) {
    setBusy(operation);
    setError(undefined);
    setMessage(undefined);
    try {
      await post(operation, input);
      setMessage(success);
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Observability operation failed");
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function changeStatus(
    operation: string,
    status: string,
    prompt: string,
    success: string,
  ) {
    const reason = window.prompt(prompt);
    if (!reason || reason.trim().length < 10) {
      setError("A reason of at least 10 characters is required.");
      return;
    }
    await apply(operation, { status, reason }, success);
  }

  async function changeState(
    operation: string,
    state: string,
    prompt: string,
    success: string,
  ) {
    const reason = window.prompt(prompt);
    if (!reason || reason.trim().length < 10) {
      setError("A reason of at least 10 characters is required.");
      return;
    }
    await apply(operation, { state, reason }, success);
  }

  async function createSlo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let queryDefinition: Record<string, unknown>;
    try {
      queryDefinition = JSON.parse(String(data.get("queryDefinition") ?? "{}")) as Record<string, unknown>;
    } catch {
      setError("Query definition must be valid JSON.");
      return;
    }
    const success = await apply("slo-create", {
      serviceName: String(data.get("serviceName") ?? ""),
      sloKey: String(data.get("sloKey") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
      indicatorType: String(data.get("indicatorType") ?? "availability"),
      objective: Number(data.get("objective") ?? 0.999),
      windowDays: Number(data.get("windowDays") ?? 30),
      latencyThresholdMs: data.get("latencyThresholdMs")
        ? Number(data.get("latencyThresholdMs"))
        : undefined,
      queryDefinition,
    }, "SLO created and included in scheduled measurement.");
    if (success) form.reset();
  }

  async function createAlertRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let condition: Record<string, unknown>;
    try {
      condition = JSON.parse(String(data.get("condition") ?? "{}")) as Record<string, unknown>;
    } catch {
      setError("Alert condition must be valid JSON.");
      return;
    }
    const success = await apply("rule-create", {
      alertKey: String(data.get("alertKey") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
      severity: String(data.get("severity") ?? "warning"),
      conditionType: String(data.get("conditionType") ?? "threshold"),
      condition,
      notificationTopic: String(data.get("notificationTopic") ?? "platform.operations"),
    }, "Alert rule created and included in scheduled evaluation.");
    if (success) form.reset();
  }

  return (
    <section className="observability-dashboard" aria-labelledby="observability-title">
      <header className="observability-heading">
        <div>
          <p className="cp-eyebrow">PLATFORM RELIABILITY</p>
          <h1 id="observability-title">Observability control</h1>
          <p>Inspect runtime evidence, manage SLOs and alert policy, acknowledge incidents and close recurring error fingerprints.</p>
        </div>
        <div className="observability-snapshot">
          <strong>Snapshot generated</strong>
          <time dateTime={overview.generatedAt}>{date(overview.generatedAt)}</time>
          <span>Privileged changes are written to platform audit evidence.</span>
        </div>
      </header>

      <section className="observability-summary" aria-label="Reliability summary">
        <div className={staleRuntimes.length ? "warning" : "healthy"}><small>Stale runtimes</small><strong>{staleRuntimes.length}</strong><span>Older than 120 seconds</span></div>
        <div className={breachedSlos.length ? "critical" : "healthy"}><small>SLO breaches</small><strong>{breachedSlos.length}</strong><span>Below current objective</span></div>
        <div className={activeAlerts.length ? "critical" : "healthy"}><small>Active alerts</small><strong>{activeAlerts.length}</strong><span>Firing or acknowledged</span></div>
        <div className={openErrors.length ? "warning" : "healthy"}><small>Open errors</small><strong>{openErrors.length}</strong><span>Aggregated fingerprints</span></div>
        <div className={backlog ? "warning" : "healthy"}><small>Platform backlog</small><strong>{backlog}</strong><span>Across asynchronous workers</span></div>
      </section>

      {error ? <p className="observability-feedback error" role="alert">{error}</p> : null}
      {message ? <p className="observability-feedback success" role="status">{message}</p> : null}

      <section className="observability-panel">
        <header><div><p className="cp-eyebrow">RUNTIME HEARTBEATS</p><h2>Deployed processes</h2></div><span>{overview.heartbeats.length} reporting</span></header>
        <div className="runtime-grid">
          {overview.heartbeats.map((runtime) => {
            const runtimeKey = text(runtime, "runtimeKey");
            const runtimeAge = numeric(runtime, "ageSeconds");
            return (
              <article key={runtimeKey} className={runtimeAge > 120 ? "stale" : undefined}>
                <div className="runtime-heading"><div><strong>{runtimeKey}</strong><small>{text(runtime, "runtimeType")} · {text(runtime, "environment")}</small></div><Pill value={runtimeAge > 120 ? "stale" : text(runtime, "status")}/></div>
                <dl><div><dt>Release</dt><dd>{text(runtime, "releaseVersion")}</dd></div><div><dt>Instance</dt><dd><code>{text(runtime, "instanceId")}</code></dd></div><div><dt>Last seen</dt><dd>{age(runtimeAge)} ago</dd></div></dl>
                <div className="runtime-capabilities">{(value<string[]>(runtime, "capabilities") ?? []).map((item) => <span key={item}>{item}</span>)}</div>
                <footer><button disabled={Boolean(busy)} type="button" onClick={() => changeStatus(`runtime-status:${runtimeKey}`, "degraded", "Record why the runtime is being marked degraded.", "Runtime marked degraded.")}>Mark degraded</button><button disabled={Boolean(busy)} type="button" onClick={() => changeStatus(`runtime-status:${runtimeKey}`, "stopping", "Record why the runtime is being marked stopping.", "Runtime marked stopping.")}>Mark stopping</button></footer>
              </article>
            );
          })}
        </div>
      </section>

      <div className="observability-columns">
        <section className="observability-panel">
          <header><div><p className="cp-eyebrow">SERVICE OBJECTIVES</p><h2>SLO definitions</h2></div><span>{overview.sloDefinitions.length}</span></header>
          <div className="slo-list">
            {overview.sloDefinitions.map((definition) => {
              const id = text(definition, "id");
              const status = text(definition, "status");
              const measurement = latestMeasurements.get(id);
              const objective = numeric(definition, "objective");
              const achieved = measurement ? numeric(measurement, "achieved") : 0;
              const budget = measurement ? numeric(measurement, "errorBudgetRemaining") : 0;
              return (
                <article key={id}>
                  <div className="slo-heading"><div><strong>{text(definition, "displayName")}</strong><small>{text(definition, "serviceName")} · {text(definition, "indicatorType")}</small></div><Pill value={status}/></div>
                  <div className="slo-values"><div><small>Achieved</small><strong>{measurement ? percent(achieved) : "No sample"}</strong></div><div><small>Objective</small><strong>{percent(objective)}</strong></div><div><small>Error budget</small><strong className={budget < 0 ? "negative" : undefined}>{measurement ? percent(budget) : "No sample"}</strong></div></div>
                  <progress max="1" value={Math.max(0, Math.min(1, achieved / Math.max(objective, 0.000001)))}/>
                  <footer><span>{numeric(definition, "windowDays")} day window · {date(value(measurement, "measuredAt"))}</span><button type="button" onClick={() => changeStatus(`slo-status:${id}`, status === "active" ? "retired" : "active", `Record why the SLO is being ${status === "active" ? "retired" : "reactivated"}.`, `SLO ${status === "active" ? "retired" : "reactivated"}.`)}>{status === "active" ? "Retire" : "Reactivate"}</button></footer>
                </article>
              );
            })}
          </div>
          <form className="observability-form" onSubmit={createSlo}>
            <h3>Define service objective</h3>
            <div><label>Service name<input name="serviceName" required placeholder="veza-api"/></label><label>SLO key<input name="sloKey" required placeholder="tenant-read-availability"/></label></div>
            <label>Display name<input name="displayName" required/></label>
            <div><label>Indicator<select name="indicatorType"><option value="availability">Availability</option><option value="latency">Latency</option><option value="freshness">Freshness</option><option value="delivery">Delivery</option></select></label><label>Objective<input name="objective" type="number" min="0.000001" max="1" step="0.000001" defaultValue="0.999"/></label></div>
            <div><label>Window days<input name="windowDays" type="number" min="1" max="90" defaultValue="30"/></label><label>Latency threshold ms<input name="latencyThresholdMs" type="number" min="1"/></label></div>
            <label>Query definition JSON<textarea name="queryDefinition" defaultValue={'{"source":"request_observations","goodStatusBelow":500}'}/></label>
            <button disabled={busy === "slo-create"}>Create SLO</button>
          </form>
        </section>

        <section className="observability-panel">
          <header><div><p className="cp-eyebrow">ALERT POLICY</p><h2>Evaluation rules</h2></div><span>{overview.alertRules.length}</span></header>
          <div className="alert-rule-list">
            {overview.alertRules.map((rule) => {
              const id = text(rule, "id");
              const status = text(rule, "status");
              return (
                <article key={id}>
                  <div><div><strong>{text(rule, "displayName")}</strong><small>{text(rule, "alertKey")} · {text(rule, "conditionType")}</small></div><Pill value={text(rule, "severity")}/></div>
                  <code>{JSON.stringify(value(rule, "condition") ?? {})}</code>
                  <footer><Pill value={status}/><div><button type="button" onClick={() => changeStatus(`rule-status:${id}`, status === "active" ? "paused" : "active", `Record why this rule is being ${status === "active" ? "paused" : "activated"}.`, `Alert rule ${status === "active" ? "paused" : "activated"}.`)}>{status === "active" ? "Pause" : "Activate"}</button>{status !== "retired" ? <button type="button" onClick={() => changeStatus(`rule-status:${id}`, "retired", "Record why the alert rule is being retired.", "Alert rule retired.")}>Retire</button> : null}</div></footer>
                </article>
              );
            })}
          </div>
          <form className="observability-form" onSubmit={createAlertRule}>
            <h3>Create alert rule</h3>
            <div><label>Alert key<input name="alertKey" required placeholder="media.backlog-high"/></label><label>Display name<input name="displayName" required/></label></div>
            <div><label>Severity<select name="severity"><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label><label>Condition type<select name="conditionType"><option value="threshold">Threshold</option><option value="absence">Absence</option><option value="burn-rate">Burn rate</option><option value="dependency">Dependency</option></select></label></div>
            <label>Condition JSON<textarea name="condition" defaultValue={'{"metric":"media_backlog","greaterThan":100,"forSeconds":300}'}/></label>
            <label>Notification topic<input name="notificationTopic" defaultValue="platform.operations" required/></label>
            <button disabled={busy === "rule-create"}>Create alert rule</button>
          </form>
        </section>
      </div>

      <section className="observability-panel incident-panel">
        <header><div><p className="cp-eyebrow">INCIDENT OPERATIONS</p><h2>Alert events</h2></div><span>{activeAlerts.length} active</span></header>
        <div className="observability-table-wrap"><table className="observability-table"><thead><tr><th>Alert</th><th>Severity</th><th>Fired</th><th>State</th><th>Operator action</th></tr></thead><tbody>{overview.alertEvents.map((alert) => {
          const id = text(alert, "id");
          const state = text(alert, "state");
          return <tr key={id}><td><strong>{text(alert, "displayName")}</strong><small>{text(alert, "summary")}</small></td><td><Pill value={text(alert, "severity")}/></td><td>{date(value(alert, "firedAt"))}</td><td><Pill value={state}/></td><td><div>{state === "firing" ? <button type="button" onClick={() => changeState(`alert-state:${id}`, "acknowledged", "Record the incident owner and acknowledgement context.", "Alert acknowledged.")}>Acknowledge</button> : null}{state !== "resolved" ? <button type="button" onClick={() => changeState(`alert-state:${id}`, "resolved", "Record remediation evidence before resolving this alert.", "Alert resolved.")}>Resolve</button> : <span>Closed {date(value(alert, "resolvedAt"))}</span>}</div></td></tr>;
        })}</tbody></table></div>
      </section>

      <section className="observability-panel error-panel">
        <header><div><p className="cp-eyebrow">ERROR REPORTING</p><h2>Aggregated fingerprints</h2></div><span>{openErrors.length} open</span></header>
        <div className="observability-table-wrap"><table className="observability-table"><thead><tr><th>Error</th><th>Service</th><th>Occurrences</th><th>Last seen</th><th>State</th><th>Operator action</th></tr></thead><tbody>{overview.errors.map((report) => {
          const id = text(report, "id");
          const state = text(report, "state");
          return <tr key={id}><td><strong>{text(report, "errorClass")}</strong><small>{text(report, "messageSummary")}</small><code>{text(report, "errorFingerprint").slice(0, 20)}…</code></td><td>{text(report, "serviceName")}<small>{text(report, "environment")} · {text(report, "releaseVersion")}</small></td><td>{numeric(report, "occurrenceCount").toLocaleString("en-ZA")}</td><td>{date(value(report, "lastSeenAt"))}</td><td><Pill value={state}/></td><td><div>{state === "open" ? <button type="button" onClick={() => changeState(`error-state:${id}`, "acknowledged", "Record the investigation owner and acknowledgement context.", "Error fingerprint acknowledged.")}>Acknowledge</button> : null}{!["resolved", "ignored"].includes(state) ? <button type="button" onClick={() => changeState(`error-state:${id}`, "resolved", "Record the remediation or release that resolved this fingerprint.", "Error fingerprint resolved.")}>Resolve</button> : null}{state !== "ignored" ? <button type="button" onClick={() => changeState(`error-state:${id}`, "ignored", "Record why this fingerprint is accepted or not actionable.", "Error fingerprint ignored.")}>Ignore</button> : null}</div></td></tr>;
        })}</tbody></table></div>
      </section>
    </section>
  );
}
