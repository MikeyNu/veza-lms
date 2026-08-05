import Link from "next/link";
import type { FormEvent } from "react";
import type { InstitutionalPolicyKey } from "@veza/contracts";
import type { InstitutionDetail, InstitutionSummary } from "../../server/institution-setup-api";
import type { SetupSubmitHandler } from "./tenant-setup-panels";

export type SetupMutation = (path: string, method: "POST" | "PUT", body: Readonly<Record<string, unknown>>, label: string) => Promise<boolean>;

export function InstitutionSelector({ institution, institutions }: { institution: InstitutionDetail; institutions: readonly InstitutionSummary[] }) {
  return <div className="institution-selector"><div><p className="eyebrow">CONFIGURING</p><h2>{institution.institution.displayName}</h2></div>{institutions.length > 1 ? <nav aria-label="Select institution">{institutions.map((item) => <Link className={item.id === institution.institution.id ? "active" : ""} href={`/admin/institution-setup?institution=${item.id}`} key={item.id}>{item.displayName}</Link>)}</nav> : null}</div>;
}

export function CampusCard({ institution, operation, onSubmit }: { institution: InstitutionDetail; operation: string | undefined; onSubmit: SetupSubmitHandler }) {
  return <details className="setup-card campus-card" open={institution.campuses.length === 0}><summary><span>03</span><div><strong>Campuses</strong><small>Physical, virtual or hybrid delivery contexts</small></div><b>{institution.campuses.length}</b></summary><form className="setup-form" onSubmit={onSubmit}>
    <label>Campus code<input name="code" required placeholder="MAIN"/></label><label>Campus name<input name="displayName" required placeholder="Main campus"/></label>
    <label>Delivery mode<select name="deliveryMode" defaultValue="hybrid"><option value="physical">Physical</option><option value="virtual">Virtual</option><option value="hybrid">Hybrid</option></select></label><label>Timezone<input name="timezone" required defaultValue={institution.institution.timezone}/></label>
    <label className="wide check-field"><input name="isPrimary" type="checkbox" defaultChecked={institution.campuses.length === 0}/><span>Make this the primary active campus</span></label>
    <label>Address line<input name="addressLine1"/></label><label>City<input name="city"/></label><label>Country<input name="country" defaultValue="South Africa"/></label>
    <button disabled={Boolean(operation)}>{operation === "Campus" ? "Creating…" : "Add campus"}</button>
  </form></details>;
}

export function AcademicPeriodCard({ institution, operation, title, mutate, onSubmit }: { institution: InstitutionDetail; operation: string | undefined; title: (value: string) => string; mutate: SetupMutation; onSubmit: SetupSubmitHandler }) {
  const published = institution.academicPeriods.filter((item) => item.status === "published").length;
  return <details className="setup-card period-card" open={institution.academicPeriods.length === 0}><summary><span>04</span><div><strong>Academic periods</strong><small>Versioned academic time and publication</small></div><b>{published} published</b></summary>
    {institution.academicPeriods.length ? <ul className="record-list">{institution.academicPeriods.map((period) => <li key={period.id}><div><strong>{period.displayName}</strong><small>{period.startsOn} → {period.endsOn}</small></div><span className={period.status}>{title(period.status)}</span>{period.status === "draft" ? <button type="button" disabled={Boolean(operation)} onClick={() => void mutate(`institutions/${institution.institution.id}/academic-periods/${period.id}/publish`, "POST", {}, `Publish ${period.displayName}`)}>Publish</button> : null}</li>)}</ul> : null}
    <form className="setup-form" onSubmit={onSubmit}><label>Period code<input name="code" required placeholder="2027"/></label><label>Display name<input name="displayName" required placeholder="Academic year 2027"/></label>
      <label>Period type<select name="periodType" defaultValue="academic-year"><option value="academic-year">Academic year</option><option value="semester">Semester</option><option value="trimester">Trimester</option><option value="term">Term</option><option value="quarter">Quarter</option><option value="block">Block</option><option value="custom">Custom</option></select></label>
      <label>Parent period<select name="parentPeriodId" defaultValue=""><option value="">No parent</option>{institution.academicPeriods.map((period) => <option value={period.id} key={period.id}>{period.displayName}</option>)}</select></label>
      <label>Starts on<input name="startsOn" type="date" required/></label><label>Ends on<input name="endsOn" type="date" required/></label><label>Teaching starts<input name="teachingStartsOn" type="date"/></label><label>Teaching ends<input name="teachingEndsOn" type="date"/></label><label className="wide">Timezone<input name="timezone" required defaultValue={institution.institution.timezone}/></label>
      <button disabled={Boolean(operation)}>{operation === "Academic period" ? "Creating…" : "Create draft period"}</button>
    </form>
  </details>;
}

export function OrganisationalUnitCard({ institution, operation, onSubmit }: { institution: InstitutionDetail; operation: string | undefined; onSubmit: SetupSubmitHandler }) {
  return <details className="setup-card unit-card"><summary><span>05</span><div><strong>Organisational units</strong><small>Faculties, departments and programme offices</small></div><b>{institution.organisationalUnits.length}</b></summary><form className="setup-form" onSubmit={onSubmit}>
    <label>Unit code<input name="code" required placeholder="DESIGN"/></label><label>Unit name<input name="displayName" required placeholder="School of Design"/></label>
    <label>Unit type<select name="unitType" defaultValue="department"><option value="faculty">Faculty</option><option value="school">School</option><option value="department">Department</option><option value="division">Division</option><option value="centre">Centre</option><option value="programme-office">Programme office</option><option value="other">Other</option></select></label>
    <label>Parent unit<select name="parentUnitId" defaultValue=""><option value="">No parent</option>{institution.organisationalUnits.map((unit) => <option value={unit.id} key={unit.id}>{unit.displayName}</option>)}</select></label>
    <button disabled={Boolean(operation)}>{operation === "Organisational unit" ? "Creating…" : "Add organisational unit"}</button>
  </form></details>;
}

export function PolicyCard({ institution, operation, currentPolicies, requiredPolicies, title, onSubmit }: { institution: InstitutionDetail; operation: string | undefined; currentPolicies: ReadonlyMap<InstitutionalPolicyKey, number>; requiredPolicies: readonly InstitutionalPolicyKey[]; title: (value: string) => string; onSubmit: SetupSubmitHandler }) {
  const visibleRequired = requiredPolicies.filter((key) => institution.institution.institutionType === "school" || key !== "safeguarding");
  const policyOptions: readonly InstitutionalPolicyKey[] = [...requiredPolicies, "academic-integrity", "assessment", "attendance", "communications"];
  return <details className="setup-card policy-card" open={currentPolicies.size === 0}><summary><span>06</span><div><strong>Institutional policies</strong><small>Approved immutable policy versions</small></div><b>{currentPolicies.size} effective</b></summary>
    <div className="policy-chip-list">{visibleRequired.map((key) => <span className={currentPolicies.has(key) ? "approved" : "missing"} key={key}>{currentPolicies.has(key) ? "✓" : "!"} {title(key)}</span>)}</div>
    <form className="setup-form" onSubmit={onSubmit}><label>Policy type<select name="policyKey" defaultValue="privacy">{policyOptions.map((key) => <option value={key} key={key}>{title(key)}</option>)}</select></label><label>Effective from<input name="effectiveFrom" type="date" required/></label>
      <label className="wide">Policy title<input name="title" required placeholder="Privacy and information handling policy"/></label><label className="wide">Purpose and scope<textarea name="summary" required rows={4}/></label><label className="wide">Controls, one per line<textarea name="controls" required rows={6}/></label>
      <button disabled={Boolean(operation)}>{operation?.endsWith("policy") ? "Approving…" : "Approve new policy version"}</button>
    </form>
  </details>;
}
