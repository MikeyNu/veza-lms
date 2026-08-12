import type { BaselineRoleKey, WorkspaceSession } from "@veza/contracts";
import { ButtonLink } from "@veza/ui";
import type { Route } from "next";
import { Icon } from "../../components/icon";
import { primaryRole, workspaceLabel } from "./navigation";

function humanize(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface NextStep {
  readonly title: string;
  readonly description: string;
  readonly href: Route;
  readonly action: string;
}

function nextStepFor(role: BaselineRoleKey, session: WorkspaceSession): NextStep {
  if (role === "tenant-owner" || role === "institution-admin") {
    return session.tenant.status === "provisioning"
      ? {
          title: "Complete institution activation",
          description: "Identity, privacy, retention and support-readiness checks must be completed before learner access is enabled.",
          href: "/admin/institution-setup",
          action: "Review activation",
        }
      : {
          title: "Configure institution structure",
          description: "Campuses, academic periods and organisational units remain governed through institution administration.",
          href: "/admin/institution-setup",
          action: "Open administration",
        };
  }
  if (role === "registrar") return { title: "Review people and enrolment controls", description: "Manage authoritative person records, enrolment evidence and academic operations within the institution boundary.", href: "/people", action: "Open people" };
  if (role === "curriculum-manager" || role === "course-manager") return { title: "Review the academic catalogue", description: "Programme, course and delivery structures are governed from the learning workspace.", href: "/learning", action: "Open learning" };
  if (role === "instructor") return { title: "Open your teaching workspace", description: "Review assigned learning delivery, learner activity and published course structure.", href: "/learning", action: "Open classes" };
  if (role === "assessor" || role === "moderator") return { title: "Review assessment work", description: "Assessment access is limited to the marking, moderation and release responsibilities assigned to this membership.", href: "/assessments", action: "Open assessments" };
  if (role === "guardian-sponsor") return { title: "Review learner information", description: "A learner summary appears only when an active relationship and disclosure policy permit access.", href: "/insights", action: "View learner summary" };
  if (role === "auditor") return { title: "Review the tenant evidence boundary", description: "Audit evidence is available only within this verified tenant context and remains read-only.", href: "/evidence", action: "Open evidence room" };
  return { title: "Review scoped support access", description: "Tenant content remains unavailable unless an approved support case grants a time-bounded diagnostic scope.", href: "/support", action: "Open support cases" };
}

export function WorkspaceHome({ session }: { session: WorkspaceSession }) {
  const role = primaryRole(session);
  const enabledModules = session.entitlements.filter((item) => item.state !== "disabled");
  const nextStep = nextStepFor(role, session);

  return (
    <section className="workspace foundation-home" aria-labelledby="workspace-title">
      <header className="foundation-heading">
        <div>
          <p className="foundation-context">{workspaceLabel(session)}</p>
          <h1 id="workspace-title">{session.tenant.displayName}</h1>
          <p>Your verified membership, institutional boundary and licensed capabilities are active in this session.</p>
        </div>
        <span className={`tenant-status ${session.tenant.status}`}>{humanize(session.tenant.status)}</span>
      </header>

      <section className="foundation-next" aria-labelledby="foundation-next-title">
        <div>
          <p className="foundation-section-label">Recommended next action</p>
          <h2 id="foundation-next-title">{nextStep.title}</h2>
          <p>{nextStep.description}</p>
          <ButtonLink href={nextStep.href} trailingIcon={<Icon name="arrow" />}>
            {nextStep.action}
          </ButtonLink>
        </div>
      </section>

      <div className="foundation-details">
        <section className="foundation-boundary" aria-labelledby="foundation-boundary-title">
          <h2 id="foundation-boundary-title">Institution boundary</h2>
          <p>Deployment and residency controls for this verified workspace.</p>
          <dl>
            <div><dt>Deployment</dt><dd>{humanize(session.tenant.deploymentTier)}</dd></div>
            <div><dt>Residency</dt><dd>{session.tenant.residencyRegion}</dd></div>
            <div><dt>Plan</dt><dd>{humanize(session.tenant.planKey)}</dd></div>
            <div><dt>Timezone</dt><dd>{session.tenant.timezone}</dd></div>
          </dl>
        </section>

        <section className="foundation-access" aria-labelledby="foundation-access-title">
          <h2 id="foundation-access-title">Access context</h2>
          <p><strong>{humanize(role)}</strong> is the primary role for this view. The session is scoped to membership <code>{session.membership.id.slice(0, 8)}</code>.</p>
          <div className="role-list" aria-label="Active membership roles">
            {session.membership.roles.map((item) => <span key={item}>{humanize(item)}</span>)}
          </div>
        </section>
      </div>

      <section className="foundation-modules" aria-labelledby="foundation-modules-title">
        <header>
          <div>
            <h2 id="foundation-modules-title">Licensed capabilities</h2>
            <p>Modules currently available to this tenant.</p>
          </div>
          <strong>{enabledModules.length} enabled</strong>
        </header>
        <ul>
          {enabledModules.map((item) => (
            <li key={item.module}>
              <span>{humanize(item.module)}</span>
              <small>{humanize(item.state)}</small>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
