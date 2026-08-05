"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InstitutionalPolicyKey, WorkspaceSession } from "@veza/contracts";
import type { InstitutionSetupBundle } from "../../server/institution-setup-api";
import {
  AcademicPeriodCard,
  CampusCard,
  InstitutionSelector,
  OrganisationalUnitCard,
  PolicyCard,
} from "./institution-detail-panels";
import {
  ActivationRail,
  InstitutionIdentityCard,
  OperationalProfileCard,
  SetupInspector,
} from "./tenant-setup-panels";

const requiredPolicies: readonly InstitutionalPolicyKey[] = [
  "privacy", "data-retention", "acceptable-use", "support-escalation", "safeguarding",
];

function title(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function messageFrom(value: unknown): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { readonly message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && message.every((item) => typeof item === "string")) return message.join(" ");
  }
  return "The institution setup operation could not be completed.";
}

function formValue(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function InstitutionSetupCentre({ bundle, session, tenantOwner }: { bundle: InstitutionSetupBundle; session: WorkspaceSession; tenantOwner: boolean }) {
  const router = useRouter();
  const [operation, setOperation] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ readonly kind: "success" | "error"; readonly message: string } | undefined>(undefined);
  const institution = bundle.selectedInstitution;
  const publishedPeriodCount = institution?.academicPeriods.filter((item) => item.status === "published").length ?? 0;
  const currentPolicies = useMemo(() => {
    const latest = new Map<InstitutionalPolicyKey, number>();
    institution?.policies.filter((item) => item.status === "approved").forEach((item) => latest.set(item.policyKey, Math.max(latest.get(item.policyKey) ?? 0, item.version)));
    return latest;
  }, [institution]);

  async function mutate(path: string, method: "POST" | "PUT", body: Readonly<Record<string, unknown>>, label: string): Promise<boolean> {
    setOperation(label);
    setFeedback(undefined);
    try {
      const response = await fetch(`/api/institution-setup/${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as unknown;
      if (!response.ok) throw new Error(messageFrom(payload));
      setFeedback({ kind: "success", message: `${label} completed and the activation evidence was refreshed.` });
      router.refresh();
      return true;
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The operation could not be completed." });
      return false;
    } finally {
      setOperation(undefined);
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("profile", "PUT", {
      identityMode: formValue(form, "identityMode"), supportEmail: formValue(form, "supportEmail"),
      privacyContactEmail: formValue(form, "privacyContactEmail"), dataRetentionDays: Number(formValue(form, "dataRetentionDays")),
      learnerSupportSlaHours: Number(formValue(form, "learnerSupportSlaHours")),
    }, "Operational profile");
  }

  async function submitInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await mutate("institutions", "POST", {
      code: formValue(form, "code"), displayName: formValue(form, "displayName"), legalName: formValue(form, "legalName") || undefined,
      institutionType: formValue(form, "institutionType"), locale: formValue(form, "locale"), timezone: formValue(form, "timezone"),
      contactEmail: formValue(form, "contactEmail") || undefined,
    }, "Institution");
    if (ok) event.currentTarget.reset();
  }

  async function submitCampus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!institution) return;
    const form = new FormData(event.currentTarget);
    const ok = await mutate(`institutions/${institution.institution.id}/campuses`, "POST", {
      code: formValue(form, "code"), displayName: formValue(form, "displayName"), deliveryMode: formValue(form, "deliveryMode"),
      timezone: formValue(form, "timezone"), isPrimary: form.get("isPrimary") === "on",
      address: { line1: formValue(form, "addressLine1"), city: formValue(form, "city"), country: formValue(form, "country") },
    }, "Campus");
    if (ok) event.currentTarget.reset();
  }

  async function submitUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!institution) return;
    const form = new FormData(event.currentTarget);
    const ok = await mutate(`institutions/${institution.institution.id}/organisational-units`, "POST", {
      code: formValue(form, "code"), displayName: formValue(form, "displayName"), unitType: formValue(form, "unitType"), parentUnitId: formValue(form, "parentUnitId") || undefined,
    }, "Organisational unit");
    if (ok) event.currentTarget.reset();
  }

  async function submitPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!institution) return;
    const form = new FormData(event.currentTarget);
    const ok = await mutate(`institutions/${institution.institution.id}/academic-periods`, "POST", {
      code: formValue(form, "code"), displayName: formValue(form, "displayName"), periodType: formValue(form, "periodType"),
      parentPeriodId: formValue(form, "parentPeriodId") || undefined, startsOn: formValue(form, "startsOn"), endsOn: formValue(form, "endsOn"),
      teachingStartsOn: formValue(form, "teachingStartsOn") || undefined, teachingEndsOn: formValue(form, "teachingEndsOn") || undefined,
      timezone: formValue(form, "timezone"),
    }, "Academic period");
    if (ok) event.currentTarget.reset();
  }

  async function submitPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!institution) return;
    const form = new FormData(event.currentTarget);
    const policyKey = formValue(form, "policyKey") as InstitutionalPolicyKey;
    const ok = await mutate(`institutions/${institution.institution.id}/policies/approve`, "POST", {
      policyKey, title: formValue(form, "title"), effectiveFrom: formValue(form, "effectiveFrom"),
      content: { schema: "veza-policy-v1", summary: formValue(form, "summary"), controls: formValue(form, "controls").split("\n").map((item) => item.trim()).filter(Boolean) },
    }, `${title(policyKey)} policy`);
    if (ok) event.currentTarget.reset();
  }

  return <section className="workspace institution-setup" aria-labelledby="institution-setup-title">
    <header className="setup-header"><div><p className="eyebrow">INSTITUTION FOUNDATION</p><h1 id="institution-setup-title">Make the institution operational before opening learning.</h1><p>Configure durable structure, academic time and approved policy evidence. Activation is computed by the API; it cannot be completed by presentation state.</p></div><span className={`setup-status ${bundle.readiness?.ready ? "ready" : "pending"}`}>{bundle.readiness?.ready ? "Ready to activate" : session.tenant.status}</span></header>
    {feedback ? <div className={`setup-feedback ${feedback.kind}`} role="status" aria-live="polite">{feedback.message}</div> : null}
    <div className="setup-layout">
      <ActivationRail bundle={bundle} tenantOwner={tenantOwner} operation={operation} tenantStatus={session.tenant.status} onActivate={() => void mutate("activate", "POST", {}, "Tenant activation")}/>
      <main className="setup-canvas">
        {tenantOwner ? <OperationalProfileCard bundle={bundle} operation={operation} onSubmit={submitProfile}/> : null}
        {tenantOwner ? <InstitutionIdentityCard session={session} count={bundle.institutions.length} operation={operation} onSubmit={submitInstitution}/> : null}
        {institution ? <><InstitutionSelector institution={institution} institutions={tenantOwner ? bundle.institutions : []}/><div className="setup-bento">
          <CampusCard institution={institution} operation={operation} onSubmit={submitCampus}/>
          <AcademicPeriodCard institution={institution} operation={operation} title={title} mutate={mutate} onSubmit={submitPeriod}/>
          <OrganisationalUnitCard institution={institution} operation={operation} onSubmit={submitUnit}/>
          <PolicyCard institution={institution} operation={operation} currentPolicies={currentPolicies} requiredPolicies={requiredPolicies} title={title} onSubmit={submitPolicy}/>
        </div></> : <div className="setup-empty"><span>02</span><div><strong>Create the institution boundary first</strong><p>Campuses, academic periods, organisational units and policies all require an institution.</p></div></div>}
      </main>
      <SetupInspector bundle={bundle} session={session} effectivePolicyCount={currentPolicies.size} publishedPeriodCount={publishedPeriodCount} title={title}/>
    </div>
  </section>;
}
