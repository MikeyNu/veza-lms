import type { WorkspaceSession } from "@veza/contracts";
import type { NavigationKey } from "./navigation";

interface SectionState {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
}

const states: Readonly<Record<Exclude<NavigationKey, "home">, SectionState>> = {
  people: {
    eyebrow: "PEOPLE AND RELATIONSHIPS",
    title: "No institutional people records are available yet",
    description: "Veza will introduce people, organisational relationships and enrolment controls only after the institution structure has been approved.",
    detail: "The current membership and role boundary is already enforced. No learner record is inferred from identity data.",
  },
  learning: {
    eyebrow: "ACADEMIC DELIVERY",
    title: "No learning spaces have been published",
    description: "Programmes, course versions, cohorts and class offerings become available after the academic catalogue and periods are configured.",
    detail: "Your verified role is ready. Academic data will not be fabricated to populate this workspace.",
  },
  studio: {
    eyebrow: "VEZA STUDIO",
    title: "Authoring opens after curriculum configuration",
    description: "Studio requires an approved curriculum container, course version and publishing workflow before a lesson can be created.",
    detail: "The Studio Pro entitlement is active, but content authoring remains gated by academic structure.",
  },
  assess: {
    eyebrow: "ASSESSMENT OPERATIONS",
    title: "No assessment cycle is active",
    description: "Assessment blueprints, attempts, grading and moderation require a published course offering and an approved assessment policy.",
    detail: "High-stakes controls will not be enabled before identity, timing and evidence requirements are configured.",
  },
  calendar: {
    eyebrow: "SCHEDULING",
    title: "No timetable has been published",
    description: "Academic periods, campuses, rooms and class offerings must exist before Veza can calculate a trustworthy schedule.",
    detail: "Personal calendar events are not generated from incomplete institution data.",
  },
  communicate: {
    eyebrow: "INSTITUTIONAL COMMUNICATION",
    title: "No communication channels are active",
    description: "Announcements and messages are created from verified classes, cohorts and institutional groups.",
    detail: "Veza does not expose an unscoped tenant-wide messaging surface.",
  },
  insights: {
    eyebrow: "PROGRESS AND INSIGHT",
    title: "There is no learning evidence to analyse yet",
    description: "Progress, mastery and intervention signals appear only after valid enrolment and learning activity events exist.",
    detail: "The workspace will distinguish missing evidence from poor performance rather than inventing a score.",
  },
  evidence: {
    eyebrow: "EVIDENCE ROOM",
    title: "Tenant evidence access is active",
    description: "This workspace is authorised for read-only institutional evidence. The audit feed is exposed through a separate bounded query surface.",
    detail: "Evidence remains tenant scoped, cursor paginated and immutable to this role.",
  },
  support: {
    eyebrow: "SUPPORT OPERATIONS",
    title: "No approved support case is open",
    description: "Diagnostic access requires an explicit case, purpose, scope and expiry. Tenant content is not available by default.",
    detail: "Every elevation and support action will create audit evidence.",
  },
  admin: {
    eyebrow: "INSTITUTION ADMINISTRATION",
    title: "The tenant foundation is ready for institution setup",
    description: "The next delivery slice introduces institutions, campuses, organisational units, academic periods and policy configuration.",
    detail: "Identity, membership, entitlements, audit and tenant isolation are already established.",
  },
  help: {
    eyebrow: "LEARNING CENTRE",
    title: "Support follows the institution boundary",
    description: "Start with your institution administrator for membership, class or assessment access. Platform support handles verified service incidents and audited escalations.",
    detail: "Never send passwords, invitation tokens or learner records through an unapproved support channel.",
  },
};

export function WorkspaceSectionPage({ session, section }: { session: WorkspaceSession; section: Exclude<NavigationKey, "home"> }) {
  const state = states[section];
  return <section className="workspace section-state" aria-labelledby="section-state-title">
    <div className="section-state-panel">
      <p className="eyebrow">{state.eyebrow}</p>
      <h1 id="section-state-title">{state.title}</h1>
      <p>{state.description}</p>
      <div className="section-state-evidence"><span aria-hidden="true">✓</span><div><strong>Verified workspace context</strong><small>{state.detail}</small></div></div>
      <dl><div><dt>Institution</dt><dd>{session.tenant.displayName}</dd></div><div><dt>Membership</dt><dd>{session.membership.id.slice(0, 8)}</dt></div><div><dt>Status</dt><dd>{session.tenant.status}</dd></div></dl>
    </div>
  </section>;
}
