import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { demoModeEnabled, demoRoleLabel } from "../../src/server/demo-mode";
import { demoRoutes, type DemoRouteDefinition } from "../../src/server/demo-routes";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const groups: readonly DemoRouteDefinition["group"][] = [
  "Learner",
  "Academic staff",
  "Administration",
  "Account and support",
];

export default async function DemoQaPage() {
  if (!demoModeEnabled()) notFound();
  const resolution = await requireWorkspaceSession();
  const role = resolution.session.membership.roles[0] ?? "learner";

  return (
    <AppShell session={resolution.session} active="home">
      <div className="demo-qa-page">
        <header className="demo-qa-heading">
          <div>
            <p>DEMO QA</p>
            <h1>Screen inspection map</h1>
            <span>
              Deterministic demo data is active. Mutations are accepted for interface testing but are not persisted.
            </span>
          </div>
          <dl>
            <div><dt>Tenant</dt><dd>{resolution.session.tenant.displayName}</dd></div>
            <div><dt>Current role</dt><dd>{demoRoleLabel(role)}</dd></div>
          </dl>
        </header>

        <div className="demo-qa-groups">
          {groups.map((group) => {
            const routes = demoRoutes.filter((route) => route.group === group);
            return (
              <section key={group} className="demo-qa-section" aria-labelledby={`demo-${group.replaceAll(" ", "-").toLowerCase()}`}>
                <header>
                  <h2 id={`demo-${group.replaceAll(" ", "-").toLowerCase()}`}>{group}</h2>
                  <span>{routes.length} screens</span>
                </header>
                <div className="demo-route-table" role="table" aria-label={`${group} demo routes`}>
                  <div className="demo-route-head" role="row">
                    <span role="columnheader">Screen</span>
                    <span role="columnheader">Purpose</span>
                    <span role="columnheader">Role access</span>
                    <span role="columnheader">Open</span>
                  </div>
                  {routes.map((route) => {
                    const available = route.roles.includes(role);
                    return (
                      <div className="demo-route-row" role="row" key={`${group}-${route.label}`}>
                        <strong role="cell">{route.label}</strong>
                        <span role="cell">{route.note}</span>
                        <span role="cell" className={available ? "demo-route-access available" : "demo-route-access"}>
                          {available ? "Current role" : route.roles.map(demoRoleLabel).join(", ")}
                        </span>
                        <span role="cell">
                          {available ? <Link href={route.href}>Open screen</Link> : <span>Switch role first</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
