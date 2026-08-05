import Link from "next/link";
import type { PlanView } from "../../server/plans-api";

function humanize(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLimit(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("en-ZA").format(value);
  if (typeof value === "boolean") return value ? "Included" : "Not included";
  if (typeof value === "string") return humanize(value);
  return "Configured";
}

export function PlanCatalogue({ plans }: { plans: readonly PlanView[] }) {
  const activePlans = plans.filter((plan) => plan.active).length;
  const assignedTenants = plans.reduce((total, plan) => total + plan.tenantCount, 0);
  return <section className="plan-catalogue" aria-labelledby="plans-title">
    <header className="plan-heading"><div><p className="cp-eyebrow">COMMERCIAL CONFIGURATION</p><h1 id="plans-title">Plans and limits</h1><p>Inspect current packaging and adoption before provisioning or changing commercial policy.</p></div><Link href="/tenants/new" className="plan-provision">Provision institution <span aria-hidden="true">→</span></Link></header>
    <div className="plan-summary"><article><small>Configured plans</small><strong>{plans.length}</strong><span>Commercial records</span></article><article><small>Available plans</small><strong>{activePlans}</strong><span>Selectable during provisioning</span></article><article><small>Assigned tenants</small><strong>{assignedTenants}</strong><span>Across all plan states</span></article></div>
    <div className="plan-grid">
      {plans.map((plan, index) => <article className={`plan-card${index === 1 && plan.active ? " featured" : ""}`} key={plan.key}>
        <header><div><p className="cp-eyebrow">{plan.key.toUpperCase()}</p><h2>{plan.displayName}</h2></div><em className={plan.active ? "active" : "inactive"}>{plan.active ? "Available" : "Inactive"}</em></header>
        <div className="plan-adoption"><span><strong>{plan.tenantCount}</strong><small>Total tenants</small></span><span><strong>{plan.activeTenantCount}</strong><small>Active tenants</small></span></div>
        <section><p className="cp-eyebrow">ENFORCED LIMITS</p><dl>{Object.entries(plan.limits).sort(([left],[right]) => left.localeCompare(right)).map(([key,value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{formatLimit(value)}</dd></div>)}</dl></section>
        <footer><span>Plan key</span><code>{plan.key}</code></footer>
      </article>)}
    </div>
    <section className="plan-governance"><div><p className="cp-eyebrow">CHANGE CONTROL</p><h2>Plan edits remain deliberately unavailable</h2></div><p>Changing limits can alter enrolment, storage and institution availability. The mutation workflow will require effective dating, impact previews, customer communication and platform audit evidence rather than editing live JSON in place.</p></section>
  </section>;
}
