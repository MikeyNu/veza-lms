"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Operation failed");
}

function useSubmission() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(work: () => Promise<void>, form?: HTMLFormElement) {
    setBusy(true); setMessage("");
    try {
      await work();
      form?.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally { setBusy(false); }
  }
  return { busy, message, run };
}

function ProgrammeComposition({ institutionId, workspace }: { institutionId: string; workspace: CatalogueWorkspace }) {
  const submission = useSubmission();
  const programmes = workspace.programmes.filter((item) => item.lifecycle === "draft" || item.lifecycle === "in_review");
  const blueprints = workspace.blueprints.filter((item) => item.lifecycle === "approved");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const versionId = String(data.get("programmeVersionId"));
    const programme = programmes.find((item) => item.id === versionId);
    if (!programme) return;
    await submission.run(() => post(`/api/catalogue/governance/programme-versions/${versionId}/courses`, {
      institutionId,
      blueprintVersionId: String(data.get("blueprintVersionId")),
      expectedProgrammeVersion: programme.version,
      sequenceNumber: Number(data.get("sequenceNumber")),
      requirementType: String(data.get("requirementType")),
      creditContribution: data.get("creditContribution") ? Number(data.get("creditContribution")) : undefined,
    }), form);
  }
  return <form className="governance-card" onSubmit={submit}><header><small>PROGRAMME COMPOSITION</small><h3>Link an approved course</h3></header><label>Draft programme<select name="programmeVersionId" required><option value="">Select programme</option>{programmes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title} · v{item.versionNumber}</option>)}</select></label><label>Approved blueprint<select name="blueprintVersionId" required><option value="">Select blueprint</option>{blueprints.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label><div className="catalogue-form-row"><label>Sequence<input name="sequenceNumber" type="number" min="1" required/></label><label>Requirement<select name="requirementType"><option value="required">Required</option><option value="elective">Elective</option><option value="optional">Optional</option></select></label></div><label>Credit contribution<input name="creditContribution" type="number" min="0" step="0.5"/></label>{submission.message ? <p className="catalogue-error">{submission.message}</p> : null}<button disabled={submission.busy || !programmes.length || !blueprints.length}>{submission.busy ? "Linking…" : "Link course"}</button></form>;
}

function RequisiteControl({ institutionId, workspace }: { institutionId: string; workspace: CatalogueWorkspace }) {
  const submission = useSubmission();
  const drafts = workspace.blueprints.filter((item) => item.lifecycle === "draft" || item.lifecycle === "in_review");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const versionId = String(data.get("blueprintVersionId"));
    const blueprint = drafts.find((item) => item.id === versionId);
    if (!blueprint) return;
    await submission.run(() => post(`/api/catalogue/governance/blueprint-versions/${versionId}/requisites`, {
      institutionId,
      requiredCourseDefinitionId: String(data.get("requiredCourseDefinitionId")),
      expectedBlueprintVersion: blueprint.version,
      requisiteType: String(data.get("requisiteType")),
      minimumResult: data.get("minimumResult") ? Number(data.get("minimumResult")) : undefined,
    }), form);
  }
  return <form className="governance-card" onSubmit={submit}><header><small>REQUISITE RULE</small><h3>Add prerequisite or equivalency</h3></header><label>Draft blueprint<select name="blueprintVersionId" required><option value="">Select blueprint</option>{drafts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label><label>Required course<select name="requiredCourseDefinitionId" required><option value="">Select course</option>{workspace.blueprints.map((item) => <option key={item.courseDefinitionId} value={item.courseDefinitionId}>{item.code} · {item.title}</option>)}</select></label><div className="catalogue-form-row"><label>Rule<select name="requisiteType"><option value="prerequisite">Prerequisite</option><option value="corequisite">Co-requisite</option><option value="equivalent">Equivalent</option></select></label><label>Minimum result<input name="minimumResult" type="number" min="0" max="100" step="0.01"/></label></div>{submission.message ? <p className="catalogue-error">{submission.message}</p> : null}<button disabled={submission.busy || !drafts.length}>{submission.busy ? "Adding…" : "Add rule"}</button></form>;
}

function RunLifecycle({ institutionId, workspace }: { institutionId: string; workspace: CatalogueWorkspace }) {
  const submission = useSubmission();
  const next: Record<string, string | undefined> = { draft: "scheduled", scheduled: "open", open: "in_progress", in_progress: "completed" };
  async function advance(runId: string, version: number, lifecycle: string) {
    const target = next[lifecycle];
    if (!target) return;
    const reason = window.prompt(`Record why this run is moving to ${target.replaceAll("_", " ")}.`);
    if (!reason || reason.trim().length < 10) return;
    await submission.run(() => post(`/api/catalogue/governance/runs/${runId}/lifecycle`, {
      institutionId,
      expectedVersion: version,
      lifecycle: target,
      reason,
    }));
  }
  return <section className="governance-card governance-list"><header><small>RUN LIFECYCLE</small><h3>Progress delivery deliberately</h3></header>{workspace.runs.filter((run) => next[run.lifecycle]).map((run) => <article key={run.id}><div><strong>{run.title}</strong><small>{run.code} · {run.lifecycle.replaceAll("_", " ")}</small></div><button type="button" disabled={submission.busy} onClick={() => advance(run.id, run.version, run.lifecycle)}>Move to {next[run.lifecycle]?.replaceAll("_", " ")}</button></article>)}{submission.message ? <p className="catalogue-error">{submission.message}</p> : null}</section>;
}

function EnrolmentLifecycle({ institutionId, workspace }: { institutionId: string; workspace: CatalogueWorkspace }) {
  const submission = useSubmission();
  const next: Record<string, readonly string[]> = { pending: ["active", "cancelled"], waitlisted: ["active", "cancelled"], active: ["completed", "withdrawn"] };
  async function transition(enrolmentId: string, version: number, status: string) {
    const reason = window.prompt(`Record the evidence for moving this enrolment to ${status}.`);
    if (!reason || reason.trim().length < 10) return;
    let completionResult: number | undefined;
    if (status === "completed") {
      const result = window.prompt("Final result percentage");
      if (result === null || !Number.isFinite(Number(result))) return;
      completionResult = Number(result);
    }
    await submission.run(() => post(`/api/catalogue/governance/enrolments/${enrolmentId}/status`, {
      institutionId,
      expectedVersion: version,
      status,
      reason,
      completionResult,
    }));
  }
  return <section className="governance-card governance-list"><header><small>ENROLMENT LIFECYCLE</small><h3>Close current memberships with evidence</h3></header>{workspace.enrolments.filter((item) => next[item.status]).slice(0, 12).map((item) => <article key={item.id}><div><strong>{item.learnerDisplayName}</strong><small>{item.courseRunTitle} · {item.status}</small></div><div className="governance-actions">{next[item.status].map((status) => <button key={status} type="button" disabled={submission.busy} onClick={() => transition(item.id, item.version, status)}>{status}</button>)}</div></article>)}{submission.message ? <p className="catalogue-error">{submission.message}</p> : null}</section>;
}

function TransferControl({ institutionId, workspace, references }: { institutionId: string; workspace: CatalogueWorkspace; references: CatalogueReferences }) {
  const submission = useSubmission();
  const current = workspace.enrolments.filter((item) => ["pending", "active", "waitlisted"].includes(item.status));
  const targetRuns = workspace.runs.filter((run) => ["scheduled", "open", "in_progress"].includes(run.lifecycle));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const enrolmentId = String(data.get("enrolmentId"));
    const enrolment = current.find((item) => item.id === enrolmentId);
    if (!enrolment) return;
    await submission.run(() => post(`/api/catalogue/enrolments/${enrolmentId}/transfer`, {
      institutionId,
      expectedVersion: enrolment.version,
      targetCourseRunId: String(data.get("targetCourseRunId")),
      targetClassSectionId: String(data.get("targetClassSectionId") || "") || undefined,
      targetCohortId: String(data.get("targetCohortId") || "") || undefined,
      reason: String(data.get("reason")),
    }), form);
  }
  return <form className="governance-card" onSubmit={submit}><header><small>CONTROLLED TRANSFER</small><h3>Move without losing history</h3></header><label>Current enrolment<select name="enrolmentId" required><option value="">Select membership</option>{current.map((item) => <option key={item.id} value={item.id}>{item.learnerDisplayName} · {item.courseRunTitle}</option>)}</select></label><label>Target run<select name="targetCourseRunId" required><option value="">Select target</option>{targetRuns.map((run) => <option key={run.id} value={run.id}>{run.code} · {run.title}</option>)}</select></label><label>Target class<select name="targetClassSectionId"><option value="">Assign later</option>{references.classes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label><label>Target cohort<select name="targetCohortId"><option value="">No cohort</option>{references.cohorts.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label><label>Transfer reason<textarea name="reason" required minLength={20} maxLength={1000}/></label>{submission.message ? <p className="catalogue-error">{submission.message}</p> : null}<button disabled={submission.busy || !current.length || !targetRuns.length}>{submission.busy ? "Transferring…" : "Transfer learner"}</button></form>;
}

function StaffAllocation({ institutionId, references }: { institutionId: string; references: CatalogueReferences }) {
  const submission = useSubmission();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const classSectionId = String(data.get("classSectionId"));
    await submission.run(() => post(`/api/catalogue/governance/classes/${classSectionId}/staff`, {
      institutionId,
      personId: String(data.get("personId")),
      allocationRole: String(data.get("allocationRole")),
      validFrom: String(data.get("validFrom")),
      validUntil: String(data.get("validUntil") || "") || undefined,
    }), form);
  }
  return <form className="governance-card" onSubmit={submit}><header><small>TEACHING ALLOCATION</small><h3>Assign staff to a class</h3></header><label>Class section<select name="classSectionId" required><option value="">Select class</option>{references.classes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label><label>Staff member<select name="personId" required><option value="">Select staff</option>{references.eligibleStaff.map((item) => <option key={item.id} value={item.id}>{item.displayName}{item.employeeNumber ? ` · ${item.employeeNumber}` : ""}</option>)}</select></label><label>Allocation role<select name="allocationRole"><option value="lead-instructor">Lead instructor</option><option value="instructor">Instructor</option><option value="assistant">Assistant</option><option value="assessor">Assessor</option></select></label><div className="catalogue-form-row"><label>Valid from<input type="date" name="validFrom" required defaultValue={new Date().toISOString().slice(0, 10)}/></label><label>Valid until<input type="date" name="validUntil"/></label></div>{submission.message ? <p className="catalogue-error">{submission.message}</p> : null}<button disabled={submission.busy || !references.classes.length || !references.eligibleStaff.length}>{submission.busy ? "Assigning…" : "Assign staff"}</button></form>;
}

export function CatalogueGovernanceControls({ institutionId, workspace, references, canManageCurriculum, canManageDelivery }: { institutionId: string; workspace: CatalogueWorkspace; references: CatalogueReferences; canManageCurriculum: boolean; canManageDelivery: boolean }) {
  if (!canManageCurriculum && !canManageDelivery) return null;
  return <section className="catalogue-governance"><header><div><p>GOVERNED OPERATIONS</p><h2>Composition, progression and historical integrity</h2></div><span>Every consequential change is version-checked and audited.</span></header><div className="governance-grid">{canManageCurriculum ? <><ProgrammeComposition institutionId={institutionId} workspace={workspace}/><RequisiteControl institutionId={institutionId} workspace={workspace}/></> : null}{canManageDelivery ? <><RunLifecycle institutionId={institutionId} workspace={workspace}/><EnrolmentLifecycle institutionId={institutionId} workspace={workspace}/><TransferControl institutionId={institutionId} workspace={workspace} references={references}/><StaffAllocation institutionId={institutionId} references={references}/></> : null}</div></section>;
}
