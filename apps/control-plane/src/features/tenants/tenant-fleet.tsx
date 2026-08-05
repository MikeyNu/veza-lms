import Link from "next/link";
import type { TenantFleetFilters, TenantFleetItem, TenantFleetPage } from "../../server/tenant-fleet-api";

function humanize(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextHref(filters: TenantFleetFilters, cursor: string): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.planKey) params.set("planKey", filters.planKey);
  params.set("cursor", cursor);
  return `/tenants?${params.toString()}`;
}

export function TenantFleet({ fleet, selected, filters }: { fleet: TenantFleetPage; selected?: TenantFleetItem; filters: TenantFleetFilters }) {
  const active = fleet.items.filter((tenant) => tenant.status === "active").length;
  const attention = fleet.items.filter((tenant) => tenant.status === "suspended" || tenant.status === "offboarding" || tenant.pendingEvents > 0).length;
  const memberships = fleet.items.reduce((total, tenant) => total + tenant.activeMemberships, 0);
  return <section className="tenant-fleet" aria-labelledby="fleet-title">
    <header className="fleet-heading"><div><p className="cp-eyebrow">TENANT OPERATIONS</p><h1 id="fleet-title">Institution fleet</h1><p>Inspect commercial state and operational signals without entering tenant content.</p></div><Link href="/tenants/new" className="fleet-create">Provision institution <span aria-hidden="true">＋</span></Link></header>
    <div className="fleet-metrics"><article><small>Loaded tenants</small><strong>{fleet.items.length}</strong><span>Current cursor page</span></article><article><small>Active</small><strong>{active}</strong><span>Serving institutions</span></article><article><small>Requires attention</small><strong>{attention}</strong><span>Status or event backlog</span></article><article><small>Active memberships</small><strong>{memberships}</strong><span>Across loaded tenants</span></article></div>
    <div className="fleet-layout">
      <main className="fleet-list">
        <form className="fleet-filters" method="get" action="/tenants"><label>Search<input name="query" defaultValue={filters.query} placeholder="Name, legal name or slug"/></label><label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option><option value="provisioning">Provisioning</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="offboarding">Offboarding</option><option value="closed">Closed</option></select></label><label>Plan<input name="planKey" defaultValue={filters.planKey} placeholder="foundation"/></label><button type="submit">Apply</button><Link href="/tenants">Clear</Link></form>
        <div className="fleet-table" role="table" aria-label="Tenant fleet">
          <div className="fleet-row fleet-header" role="row"><span role="columnheader">Institution</span><span role="columnheader">Status</span><span role="columnheader">Plan</span><span role="columnheader">Members</span><span role="columnheader">Signals</span></div>
          {fleet.items.map((tenant) => <Link href={`/tenants/${tenant.id}`} className={`fleet-row${selected?.id === tenant.id ? " selected" : ""}`} role="row" key={tenant.id}><span role="cell"><strong>{tenant.displayName}</strong><small>{tenant.slug}</small></span><span role="cell"><em className={`fleet-status ${tenant.status}`}>{humanize(tenant.status)}</em></span><span role="cell"><strong>{humanize(tenant.planKey)}</strong><small>{humanize(tenant.deploymentTier)}</small></span><span role="cell"><strong>{tenant.activeMemberships}</strong><small>{tenant.pendingInvitations} invitations</small></span><span role="cell"><strong>{tenant.pendingEvents}</strong><small>pending events</small></span></Link>)}
        </div>
        {fleet.items.length === 0 ? <div className="fleet-empty"><h2>No tenants match these filters</h2><p>Clear one or more filters or provision a new institution.</p></div> : null}
        {fleet.page.nextCursor ? <div className="fleet-pagination"><Link href={nextHref(filters, fleet.page.nextCursor)}>Load older tenants <span aria-hidden="true">→</span></Link></div> : null}
      </main>
      <aside className="fleet-inspector" aria-label="Selected tenant details">
        {selected ? <><div className="fleet-inspector-heading"><span>{selected.displayName.slice(0,1).toUpperCase()}</span><div><p className="cp-eyebrow">SELECTED TENANT</p><h2>{selected.displayName}</h2><small>{selected.legalName}</small></div></div><dl><div><dt>Status</dt><dd><em className={`fleet-status ${selected.status}`}>{humanize(selected.status)}</em></dd></div><div><dt>Tenant ID</dt><dd><code>{selected.id}</code></dd></div><div><dt>Region</dt><dd>{selected.residencyRegion}</dd></div><div><dt>Timezone</dt><dd>{selected.timezone}</dd></div><div><dt>Locale</dt><dd>{selected.locale}</dd></div><div><dt>Created</dt><dd>{new Intl.DateTimeFormat("en-ZA",{dateStyle:"medium"}).format(new Date(selected.createdAt))}</dd></div></dl><section><p className="cp-eyebrow">LICENSED MODULES</p><div className="fleet-modules">{selected.modules.map((module) => <span key={module}>{humanize(module)}</span>)}</div></section><Link className="fleet-open-tenant" href={`/tenants/${selected.id}`}>Open tenant operations</Link><div className="fleet-boundary"><strong>Content boundary intact</strong><p>This view contains operational metadata only. Learners, course content, submissions and assessments are unavailable to platform operators.</p></div></> : <div className="fleet-inspector-empty"><span aria-hidden="true">◎</span><h2>Select an institution</h2><p>Choose a tenant to inspect its plan, region, modules and operational counts.</p></div>}
      </aside>
    </div>
  </section>;
}