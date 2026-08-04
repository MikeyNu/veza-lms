import type { FormEvent } from "react";
import type { WorkspaceSession } from "@veza/contracts";
import type { InstitutionSetupBundle } from "../../server/institution-setup-api";

export type SetupSubmitHandler = (event: FormEvent<HTMLFormElement>) => void | Promise<void>;

export function ActivationRail({
  bundle,
  tenantOwner,
  operation,
  tenantStatus,
  onActivate,
}: {
  bundle: InstitutionSetupBundle;
  tenantOwner: boolean;
  operation: string | undefined;
  tenantStatus: WorkspaceSession["tenant"]["status"];
  onActivate: () => void;
}) {
  const checks = bundle.readiness?.checks ?? [];
  const completed = checks.filter((item) => item.passed).length;
  return <aside className="activation-rail">
    <div className="activation-score"><span>{checks.length ? `${completed}/${checks.length}` : "Scoped"}</span><div><strong>Activation evidence</strong><small>{tenantOwner ? "Tenant-wide launch gate" : "Institution configuration"}</small></div></div>
    {checks.length ? <ol>{checks.map((item) => <li className={item.passed ? "passed" : "blocked"} key={item.key}><span>{item.passed ? "✓" : "!"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ol> : <div className="scoped-admin-note"><strong>Scoped institution role</strong><p>You can configure the assigned institution. Tenant activation and tenant-wide operational settings remain with a tenant owner.</p></div>}
    {tenantOwner && bundle.readiness ? <button className="activate-button" type="button" disabled={!bundle.readiness.ready || operation === "Tenant activation" || tenantStatus !== "provisioning"} onClick={onActivate}>{operation === "Tenant activation" ? "Activating…" : tenantStatus === "active" ? "Tenant active" : "Activate tenant"}</button> : null}
  </aside>;
}

export function OperationalProfileCard({ bundle, operation, onSubmit }: { bundle: InstitutionSetupBundle; operation: string | undefined; onSubmit: SetupSubmitHandler }) {
  return <details className="setup-card operational-card" open={!bundle.profile}>
    <summary><span>01</span><div><strong>Operational profile</strong><small>Identity, privacy, retention and learner support</small></div><b>{bundle.profile ? "Configured" : "Required"}</b></summary>
    <form className="setup-form" onSubmit={onSubmit}>
      <label>Identity mode<select name="identityMode" defaultValue={bundle.profile?.identityMode ?? "sso"}><option value="managed">Veza managed</option><option value="sso">Institution SSO</option><option value="hybrid">Hybrid</option></select></label>
      <label>Support email<input name="supportEmail" type="email" required defaultValue={bundle.profile?.supportEmail}/></label>
      <label>Privacy contact<input name="privacyContactEmail" type="email" required defaultValue={bundle.profile?.privacyContactEmail}/></label>
      <label>Retention days<input name="dataRetentionDays" type="number" min="30" max="3650" required defaultValue={bundle.profile?.dataRetentionDays ?? 365}/></label>
      <label>Learner support SLA<input name="learnerSupportSlaHours" type="number" min="1" max="720" required defaultValue={bundle.profile?.learnerSupportSlaHours ?? 48}/></label>
      <button disabled={Boolean(operation)}>{operation === "Operational profile" ? "Saving…" : "Save operational profile"}</button>
    </form>
  </details>;
}

export function InstitutionIdentityCard({ session, count, operation, onSubmit }: { session: WorkspaceSession; count: number; operation: string | undefined; onSubmit: SetupSubmitHandler }) {
  return <details className="setup-card institution-card" open={count === 0}>
    <summary><span>02</span><div><strong>Institution identity</strong><small>Legal, academic and regional context</small></div><b>{count ? `${count} configured` : "Required"}</b></summary>
    <form className="setup-form" onSubmit={onSubmit}>
      <label>Institution code<input name="code" required placeholder="AKHA"/></label><label>Display name<input name="displayName" required placeholder="Akha Academy"/></label>
      <label className="wide">Registered legal name<input name="legalName" placeholder="Optional legal entity"/></label>
      <label>Institution type<select name="institutionType" defaultValue="training-provider"><option value="school">School</option><option value="college">College</option><option value="university">University</option><option value="training-provider">Training provider</option><option value="corporate-academy">Corporate academy</option><option value="other">Other</option></select></label>
      <label>Locale<select name="locale" defaultValue={session.tenant.locale}><option value="en-ZA">English / South Africa</option><option value="en-GB">English / United Kingdom</option><option value="en-US">English / United States</option></select></label>
      <label>Timezone<input name="timezone" required defaultValue={session.tenant.timezone}/></label><label>Contact email<input name="contactEmail" type="email"/></label>
      <button disabled={Boolean(operation)}>{operation === "Institution" ? "Creating…" : "Create institution"}</button>
    </form>
  </details>;
}

export function SetupInspector({ bundle, session, effectivePolicyCount, publishedPeriodCount, title }: { bundle: InstitutionSetupBundle; session: WorkspaceSession; effectivePolicyCount: number; publishedPeriodCount: number; title: (value: string) => string }) {
  const institution = bundle.selectedInstitution;
  return <aside className="setup-inspector">
    <p className="eyebrow">BOUNDARY PREVIEW</p>
    <div className="inspector-identity"><span>{institution?.institution.displayName[0]?.toUpperCase() ?? session.tenant.displayName[0]?.toUpperCase()}</span><div><strong>{institution?.institution.displayName ?? session.tenant.displayName}</strong><small>{institution ? `${institution.institution.code} · ${title(institution.institution.institutionType)}` : "Institution not configured"}</small></div></div>
    <dl><div><dt>Tenant state</dt><dd>{title(session.tenant.status)}</dd></div><div><dt>Campus contexts</dt><dd>{institution?.campuses.length ?? 0}</dd></div><div><dt>Organisation units</dt><dd>{institution?.organisationalUnits.length ?? 0}</dd></div><div><dt>Published periods</dt><dd>{publishedPeriodCount}</dd></div><div><dt>Effective policies</dt><dd>{effectivePolicyCount}</dd></div></dl>
    <div className="inspector-rule"><strong>Activation is evidence-based</strong><p>Only the API can move this tenant to active, after locking and rechecking every blocking fact in the same transaction.</p></div>
  </aside>;
}
