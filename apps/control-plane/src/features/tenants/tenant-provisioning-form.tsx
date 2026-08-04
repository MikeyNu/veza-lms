"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { DeploymentTier, TenantModuleKey } from "@veza/contracts";

interface ProvisioningState {
  displayName: string;
  legalName: string;
  slug: string;
  deploymentTier: DeploymentTier;
  residencyRegion: string;
  planKey: string;
  locale: string;
  timezone: string;
  ownerEmail: string;
  modules: readonly TenantModuleKey[];
}

interface ProvisioningResponse {
  readonly tenant?: { readonly displayName: string };
  readonly message?: string | readonly string[];
}

const availableModules: readonly Readonly<{
  key: TenantModuleKey;
  label: string;
  description: string;
}>[] = [
  { key: "core", label: "Core learning operations", description: "Identity, calendar, delivery, communication and reporting." },
  { key: "studio-pro", label: "Studio Pro", description: "Structured authoring, review, accessibility checks and versioning." },
  { key: "exams", label: "Exams", description: "High-stakes assessment controls, moderation and secure delivery." },
  { key: "advanced-analytics", label: "Advanced analytics", description: "Institution-level outcomes, risk and engagement analysis." },
  { key: "credentials", label: "Credentials", description: "Certificates, badges and verifiable achievement records." },
  { key: "guardian-portal", label: "Guardian portal", description: "Consent-aware learner summaries, notices and sponsor communication." },
  { key: "ai-assist", label: "AI assist", description: "Governed assistance for authoring, feedback and institutional workflows." },
  { key: "integration-hub", label: "Integration hub", description: "SSO, SCIM, OneRoster, LTI, APIs and managed connectors." },
  { key: "commerce", label: "Commerce", description: "Paid enrolment, orders, invoices, refunds and finance reconciliation." },
];

const initialState: ProvisioningState = {
  displayName: "",
  legalName: "",
  slug: "",
  deploymentTier: "shared",
  residencyRegion: "af-south-1",
  planKey: "growth",
  locale: "en-ZA",
  timezone: "Africa/Johannesburg",
  ownerEmail: "",
  modules: ["core"],
};

function newIdempotencyKey(): string {
  return `tenant-${Date.now()}-${crypto.randomUUID()}`;
}

function errorMessage(body: ProvisioningResponse, fallback: string): string {
  if (Array.isArray(body.message)) return body.message.join(" ");
  return typeof body.message === "string" ? body.message : fallback;
}

export function TenantProvisioningForm() {
  const [state, setState] = useState<ProvisioningState>(initialState);
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const requestKey = useRef(newIdempotencyKey());
  const selectedModuleDetails = useMemo(
    () => availableModules.filter((module) => state.modules.includes(module.key)),
    [state.modules],
  );

  function update<K extends keyof ProvisioningState>(key: K, value: ProvisioningState[K]): void {
    requestKey.current = newIdempotencyKey();
    setStatus("idle");
    setMessage("");
    setState((current) => ({ ...current, [key]: value }));
  }

  function toggleModule(module: TenantModuleKey): void {
    if (module === "core") return;
    update(
      "modules",
      state.modules.includes(module)
        ? state.modules.filter((item) => item !== module)
        : [...state.modules, module],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }

    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestKey.current,
        },
        body: JSON.stringify(state),
      });
      const body = await response.json() as ProvisioningResponse;
      if (!response.ok) {
        setStatus("error");
        setMessage(errorMessage(body, "Provisioning could not be started."));
        return;
      }
      setStatus("success");
      setMessage(`${body.tenant?.displayName ?? state.displayName} entered the provisioning workflow.`);
    } catch {
      setStatus("error");
      setMessage("The control plane could not reach the provisioning service. The request key has been retained for a safe retry.");
    }
  }

  return <form className="provision-layout" onSubmit={submit}>
    <aside className="provision-steps" aria-label="Provisioning steps">
      <p className="section-kicker">Provision tenant</p>
      <h1>Set the institution boundary before configuring learning.</h1>
      <p>These decisions determine isolation, residency, entitlements and the first accountable administrator.</p>
      {[1, 2, 3].map((number) => <button
        className={step === number ? "provision-step active" : step > number ? "provision-step complete" : "provision-step"}
        type="button"
        onClick={() => number < step && setStep(number)}
        aria-current={step === number ? "step" : undefined}
        key={number}
      >
        <span>{step > number ? "✓" : number}</span>
        <div>
          <strong>{number === 1 ? "Institution and tenancy" : number === 2 ? "Capabilities and limits" : "Owner and review"}</strong>
          <small>{number === 1 ? "Contractual boundary" : number === 2 ? "Licensed modules" : "Accountability and confirmation"}</small>
        </div>
      </button>)}
    </aside>

    <section className="provision-canvas">
      <div className="provision-heading">
        <div><p className="section-kicker">STEP {step} OF 3</p><h2>{step === 1 ? "Institution and tenancy" : step === 2 ? "Capabilities and limits" : "Owner and review"}</h2></div>
        <span className={status === "success" ? "draft-state complete" : "draft-state"}>{status === "success" ? "Queued" : "Draft"}</span>
      </div>

      {step === 1 ? <div className="form-grid">
        <label className="wide">Institution display name<input required maxLength={120} value={state.displayName} onChange={(event: ChangeEvent<HTMLInputElement>) => update("displayName", event.target.value)} placeholder="e.g. Akha Academy"/></label>
        <label className="wide">Registered legal name<input required maxLength={180} value={state.legalName} onChange={(event: ChangeEvent<HTMLInputElement>) => update("legalName", event.target.value)} placeholder="Legal entity on the agreement"/></label>
        <label>Workspace slug<input required pattern="[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?" value={state.slug} onChange={(event: ChangeEvent<HTMLInputElement>) => update("slug", event.target.value.toLowerCase())} placeholder="akha-academy"/><small>Used for domains, storage namespaces and support references.</small></label>
        <label>Deployment tier<select value={state.deploymentTier} onChange={(event: ChangeEvent<HTMLSelectElement>) => update("deploymentTier", event.target.value as DeploymentTier)}><option value="shared">Shared</option><option value="protected">Protected</option><option value="sovereign">Sovereign</option></select><small>Changes the isolation topology, not the product model.</small></label>
        <label>Residency region<select value={state.residencyRegion} onChange={(event: ChangeEvent<HTMLSelectElement>) => update("residencyRegion", event.target.value)}><option value="af-south-1">South Africa / Cape Town</option><option value="eu-west-1">EU / Ireland</option><option value="eu-central-1">EU / Frankfurt</option></select></label>
        <label>Commercial plan<select value={state.planKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => update("planKey", event.target.value)}><option value="foundation">Foundation</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option></select></label>
        <label>Default locale<select value={state.locale} onChange={(event: ChangeEvent<HTMLSelectElement>) => update("locale", event.target.value)}><option value="en-ZA">English / South Africa</option><option value="en-GB">English / United Kingdom</option><option value="en-US">English / United States</option></select></label>
        <label>Institution timezone<select value={state.timezone} onChange={(event: ChangeEvent<HTMLSelectElement>) => update("timezone", event.target.value)}><option value="Africa/Johannesburg">Africa / Johannesburg</option><option value="Europe/London">Europe / London</option><option value="America/New_York">America / New York</option></select></label>
      </div> : null}

      {step === 2 ? <div className="module-list">{availableModules.map((module) => <label className={state.modules.includes(module.key) ? "module-option selected" : "module-option"} key={module.key}>
        <input type="checkbox" checked={state.modules.includes(module.key)} disabled={module.key === "core"} onChange={() => toggleModule(module.key)}/>
        <span className="module-check" aria-hidden="true">{state.modules.includes(module.key) ? "✓" : ""}</span>
        <div><strong>{module.label}</strong><p>{module.description}</p></div>
        {module.key === "core" ? <em>Required</em> : null}
      </label>)}</div> : null}

      {step === 3 ? <div className="review-stack">
        <label>First tenant owner<input required type="email" value={state.ownerEmail} onChange={(event: ChangeEvent<HTMLInputElement>) => update("ownerEmail", event.target.value)} placeholder="owner@institution.edu"/><small>The invitation is encrypted for delivery and creates no membership until accepted by the matching verified identity.</small></label>
        <div className="review-card">
          <div><small>Institution</small><strong>{state.displayName || "Not entered"}</strong><span>{state.legalName || "Legal name missing"}</span></div>
          <div><small>Boundary</small><strong>{state.deploymentTier}</strong><span>{state.residencyRegion} · {state.planKey}</span></div>
          <div><small>Capabilities</small><strong>{selectedModuleDetails.length} modules</strong><span>{selectedModuleDetails.map((module) => module.label).join(", ")}</span></div>
        </div>
        <div className="provision-invariants"><strong>Provisioning invariants</strong><ul><li>Tenant starts in provisioning, not active.</li><li>Core entitlement is mandatory.</li><li>Owner receives an invitation, not an implicit account.</li><li>Audit and outbox records commit with the tenant.</li></ul></div>
      </div> : null}

      <div aria-live="polite">{message ? <p className={`form-message ${status}`}>{message}</p> : null}</div>
      <footer className="provision-actions">
        <button className="button-secondary" type="button" disabled={step === 1 || status === "submitting" || status === "success"} onClick={() => setStep((current) => current - 1)}>Back</button>
        <button className="button-primary" type="submit" disabled={status === "submitting" || status === "success"}>{status === "submitting" ? "Provisioning…" : status === "success" ? "Provisioning queued" : step < 3 ? "Continue" : "Start provisioning"}</button>
      </footer>
    </section>

    <aside className="provision-inspector">
      <p className="section-kicker">Boundary preview</p>
      <div className="tenant-preview"><span>{state.displayName[0]?.toUpperCase() || "V"}</span><div><strong>{state.displayName || "New institution"}</strong><small>{state.slug ? `${state.slug}.veza.cloud` : "workspace.veza.cloud"}</small></div></div>
      <dl>
        <div><dt>Status</dt><dd><i/> Provisioning</dd></div>
        <div><dt>Data topology</dt><dd>{state.deploymentTier}</dd></div>
        <div><dt>Residency</dt><dd>{state.residencyRegion}</dd></div>
        <div><dt>Plan</dt><dd>{state.planKey}</dd></div>
        <div><dt>Modules</dt><dd>{state.modules.length}</dd></div>
      </dl>
      <div className="inspector-note"><strong>Why activation is separate</strong><p>Identity, privacy, academic policy, retention and support checks must pass before learners can enter the workspace.</p></div>
    </aside>
  </form>;
}
