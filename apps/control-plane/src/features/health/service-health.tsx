import Link from "next/link";
import type { ServiceHealthSnapshot } from "../../server/service-health-api";

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function humanize(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ServiceHealth({ snapshot }: { snapshot: ServiceHealthSnapshot }) {
  const healthy = snapshot.status === "ready";
  return <section className="service-health" aria-labelledby="service-health-title">
    <header className="service-health-heading"><div><p className="cp-eyebrow">SERVICE OPERATIONS</p><h1 id="service-health-title">Platform readiness</h1><p>Deployment-facing health based on live database connectivity and transactional event delivery.</p></div><Link href="/health" className="health-refresh">Refresh snapshot <span aria-hidden="true">↻</span></Link></header>
    <div className={`health-banner ${snapshot.status}`}><span aria-hidden="true">{healthy ? "✓" : snapshot.status === "degraded" ? "!" : "×"}</span><div><p className="cp-eyebrow">CURRENT STATE</p><h2>{humanize(snapshot.status)}</h2><p>{healthy ? "The API is ready to serve application and control-plane traffic." : snapshot.status === "degraded" ? "Core traffic is available, but event delivery requires attention." : "The API is not ready to receive traffic. Investigate the failed dependency."}</p></div><time dateTime={snapshot.timestamp}>{new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(snapshot.timestamp))}</time></div>
    <div className="health-grid">
      <article className={`health-component ${snapshot.checks.database.status}`}><header><div><p className="cp-eyebrow">PRIMARY DATA STORE</p><h2>PostgreSQL</h2></div><em>{humanize(snapshot.checks.database.status)}</em></header><strong>{snapshot.checks.database.latencyMs}<small> ms</small></strong><p>Control-plane connectivity latency measured during this readiness evaluation.</p></article>
      <article className={`health-component ${snapshot.checks.eventDelivery.status}`}><header><div><p className="cp-eyebrow">DOMAIN EVENTS</p><h2>Outbox delivery</h2></div><em>{humanize(snapshot.checks.eventDelivery.status)}</em></header><div className="health-pair"><span><strong>{snapshot.checks.eventDelivery.pendingEvents}</strong><small>Pending</small></span><span><strong>{duration(snapshot.checks.eventDelivery.oldestPendingSeconds)}</strong><small>Oldest pending</small></span><span className={snapshot.checks.eventDelivery.deadLetterEvents > 0 ? "has-failure" : ""}><strong>{snapshot.checks.eventDelivery.deadLetterEvents}</strong><small>Dead letter</small></span></div><p>Dead-letter events require an authenticated operator reconciliation workflow and never retry automatically.</p></article>
      <article className="health-component neutral"><header><div><p className="cp-eyebrow">PROCESS</p><h2>API uptime</h2></div><em>Observed</em></header><strong>{duration(snapshot.uptimeSeconds)}</strong><p>Time since the current API process started. This is not a substitute for availability history.</p></article>
      <article className="health-component boundary"><header><div><p className="cp-eyebrow">DISCLOSURE BOUNDARY</p><h2>Operational metadata only</h2></div><em>Enforced</em></header><p>Health endpoints disclose component state and aggregate backlog only. They never expose institution names, people, learning records or event payloads.</p></article>
    </div>
    <section className="health-runbook"><div><p className="cp-eyebrow">OPERATOR RESPONSE</p><h2>Readiness interpretation</h2></div><ol><li><strong>Not ready</strong><span>Remove the instance from traffic and restore database connectivity before retrying.</span></li><li><strong>Degraded</strong><span>Keep core traffic available, inspect event workers and reconcile backlog or dead-letter records.</span></li><li><strong>Ready</strong><span>Continue normal operations and monitor trends rather than a single snapshot.</span></li></ol></section>
  </section>;
}
