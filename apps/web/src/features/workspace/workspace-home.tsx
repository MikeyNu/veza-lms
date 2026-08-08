import type { BaselineRoleKey, WorkspaceSession } from "@veza/contracts";
import type { Route } from "next";
import Link from "next/link";
import { DashboardOverview } from "../dashboard/dashboard-overview";
import { primaryRole, workspaceLabel } from "./navigation";

function humanize(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface NextStep {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly href: Route;
  readonly action: string;
}

function nextStepFor(role: BaselineRoleKey, session: WorkspaceSession): NextStep {
  if (role === "tenant-owner" || role === "institution-admin") {
    return session.tenant.status === "provisioning"
      ? {
          eyebrow: "NEXT OPERATIONAL GATE",
          title: "Complete institution activation",
          description: "Identity, privacy, retention and support-readiness checks must be completed before learner access is enabled.",
          href: "/admin/institution-setup",
          action: "Review activation",
        }
      : {
          eyebrow: "NEXT OPERATIONAL GATE",
          title: "Configure institution structure",
          description: "Campuses, academic periods and organisational units remain governed through institution administration.",
          href: "/admin/institution-setup",
          action: "Open administration",
        };
  }
  if (role === "registrar") return { eyebrow: "REGISTRY READINESS", title: "Review people and enrolment controls", description: "Manage authoritative person records, enrolment evidence and academic operations within the institution boundary.", href: "/people", action: "Open people" };
  if (role === "curriculum-manager" || role === "course-manager") return { eyebrow: "CURRICULUM OPERATIONS", title: "Review the academic catalogue", description: "Programme, course and delivery structures are governed from the learning workspace.", href: "/learning", action: "Open learning" };
  if (role === "instructor") return { eyebrow: "TEACHING OPERATIONS", title: "Open your teaching workspace", description: "Review assigned learning delivery, learner activity and published course structure.", href: "/learning", action: "Open classes" };
  if (role === "learner") return { eyebrow: "LEARNING", title: "Continue your learning", description: "Resume published course work and review the next activity that needs attention.", href: "/learning", action: "Open my learning" };
  if (role === "assessor" || role === "moderator") return { eyebrow: "ASSESSMENT", title: "Review assessment work", description: "Assessment access is limited to the marking, moderation and release responsibilities assigned to this membership.", href: "/assessments", action: "Open assessments" };
  if (role === "guardian-sponsor") return { eyebrow: "RELATIONSHIP STATUS", title: "Review learner information", description: "A learner summary appears only when an active relationship and disclosure policy permit access.", href: "/insights", action: "View learner summary" };
  if (role === "auditor") return { eyebrow: "EVIDENCE ACCESS", title: "Review the tenant evidence boundary", description: "Audit evidence is available only within this verified tenant context and remains read-only.", href: "/evidence", action: "Open evidence room" };
  return { eyebrow: "SUPPORT BOUNDARY", title: "Support access is scoped and audited", description: "Tenant content remains unavailable unless an approved support case grants a time-bounded diagnostic scope.", href: "/support", action: "Open support cases" };
}

function TenantFoundationOverview({ session }: { session: WorkspaceSession }) {
  const role = primaryRole(session);
  const enabledModules = session.entitlements.filter((item) => item.state !== "disabled");
  const nextStep = nextStepFor(role, session);
  return <section className="workspace foundation-home" aria-labelledby="workspace-title">
    <header className="foundation-heading">
      <div><p className="eyebrow">{workspaceLabel(session).toUpperCase()}</p><h1 id="workspace-title">{session.tenant.displayName}</h1><p>Your verified membership, institutional boundary and licensed capabilities are active in this session.</p></div>
      <span className={`tenant-status ${session.tenant.status}`}>{humanize(session.tenant.status)}</span>
    </header>

    <div className="foundation-grid">
      <article className="foundation-card foundation-boundary">
        <p className="eyebrow">INSTITUTION BOUNDARY</p>
        <h2>Isolation and residency</h2>
        <dl><div><dt>Deployment</dt><dd>{humanize(session.tenant.deploymentTier)}</dd></div><div><dt>Residency</dt><dd>{session.tenant.residencyRegion}</dd></div><div><dt>Plan</dt><dd>{humanize(session.tenant.planKey)}</dd></div><div><dt>Timezone</dt><dd>{session.tenant.timezone}</dd></div></dl>
      </article>

      <article className="foundation-card">
        <p className="eyebrow">ACCESS CONTEXT</p>
        <h2>{humanize(role)}</h2>
        <p>This view is scoped to membership <code>{session.membership.id.slice(0, 8)}</code>. Switching institutions creates a new server-verified context.</p>
        <div className="role-list">{session.membership.roles.map((item) => <span key={item}>{humanize(item)}</span>)}</div>
      </article>

      <article className="foundation-card foundation-modules">
        <p className="eyebrow">LICENSED CAPABILITIES</p>
        <h2>{enabledModules.length} enabled modules</h2>
        <ul>{enabledModules.map((item) => <li key={item.module}><span>{humanize(item.module)}</span><small>{humanize(item.state)}</small></li>)}</ul>
      </article>

      <article className="foundation-card foundation-next">
        <p className="eyebrow">{nextStep.eyebrow}</p>
        <h2>{nextStep.title}</h2>
        <p>{nextStep.description}</p>
        <Link href={nextStep.href}>{nextStep.action} <span aria-hidden="true">→</span></Link>
      </article>
    </div>
  </section>;
}

export function WorkspaceHome({ session, demo }: { session: WorkspaceSession; demo: boolean }) {
  const role = primaryRole(session);
  return demo && role === "learner"
    ? <DashboardOverview session={session}/>
    : <TenantFoundationOverview session={session}/>;
}
