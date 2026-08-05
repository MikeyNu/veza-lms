"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  BaselineRoleKey,
  CatalogueReferences,
  CatalogueWorkspace,
  CourseBlueprintSummary,
  ProgrammeVersionSummary,
} from "@veza/contracts";

type View = "curriculum" | "delivery" | "enrolments";

function formatDate(value?: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

function lifecycle(value: string): string {
  return value.replaceAll("_", " ");
}

async function post(path: string, input: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Operation failed");
}

function ActionPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <details className="catalogue-action-panel">
      <summary><span><small>{eyebrow}</small><strong>{title}</strong></span><b>＋</b></summary>
      {children}
    </details>
  );
}

function MutationForm({
  operation,
  institutionId,
  children,
  build,
  submitLabel,
}: {
  operation: string;
  institutionId: string;
  children: ReactNode;
  build: (form: FormData) => unknown;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    try {
      await post(`/api/catalogue/${operation}`, { institutionId, ...build(new FormData(event.currentTarget)) as object });
      event.currentTarget.reset();
      setState("idle");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Operation failed");
    }
  }
  return (
    <form className="catalogue-form" onSubmit={submit}>
      {children}
      {message ? <p className="catalogue-error" role="alert">{message}</p> : null}
      <button type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving…" : submitLabel}</button>
    </form>
  );
}

function ApprovalButton({ institutionId, kind, record }: { institutionId: string; kind: "programmes" | "blueprints"; record: ProgrammeVersionSummary | CourseBlueprintSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function approve() {
    const effectiveFrom = window.prompt("Effective date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!effectiveFrom) return;
    const approvalNotes = window.prompt("Record the approval basis and evidence.");
    if (!approvalNotes || approvalNotes.trim().length < 20) {
      setMessage("Approval evidence must contain at least 20 characters.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      await post(`/api/catalogue/approve/${kind}/${record.id}`, {
        institutionId,
        expectedVersion: record.version,
        effectiveFrom,
        approvalNotes,
      });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval failed");
      setBusy(false);
    }
  }
  return <div className="catalogue-approval"><button type="button" onClick={approve} disabled={busy}>{busy ? "Approving…" : "Approve"}</button>{message ? <small>{message}</small> : null}</div>;
}

function CurriculumView({ institutionId, workspace, canManage, canApprove }: { institutionId: string; workspace: CatalogueWorkspace; canManage: boolean; canApprove: boolean }) {
  return (
    <div className="catalogue-view-grid">
      <section className="catalogue-main-surface">
        <header><div><p>PROGRAMME ARCHITECTURE</p><h2>Programmes and learning paths</h2></div><span>{workspace.programmes.length}</span></header>
        {workspace.programmes.length ? <div className="catalogue-record-list">{workspace.programmes.map((item) => <article key={item.id}><div className="catalogue-code">{item.code}</div><div><strong>{item.title}</strong><small>{item.programmeType.replaceAll("-", " ")} · Version {item.versionNumber}</small></div><dl><div><dt>Credits</dt><dd>{item.creditValue ?? "—"}</dd></div><div><dt>Courses</dt><dd>{item.courseCount}</dd></div><div><dt>State</dt><dd><em className={`catalogue-state ${item.lifecycle}`}>{lifecycle(item.lifecycle)}</em></dd></div></dl>{canApprove && item.lifecycle !== "approved" ? <ApprovalButton institutionId={institutionId} kind="programmes" record={item}/> : null}</article>)}</div> : <div className="catalogue-empty"><strong>No programme definitions yet</strong><p>Create the institution's first governed programme version.</p></div>}
      </section>
      <section className="catalogue-main-surface">
        <header><div><p>COURSE BLUEPRINTS</p><h2>Approved teaching definitions</h2></div><span>{workspace.blueprints.length}</span></header>
        {workspace.blueprints.length ? <div className="catalogue-record-list">{workspace.blueprints.map((item) => <article key={item.id}><div className="catalogue-code">{item.code}</div><div><strong>{item.title}</strong><small>{item.subjectArea ?? "Unclassified"} · Version {item.versionNumber}</small></div><dl><div><dt>Outcomes</dt><dd>{item.outcomeCount}</dd></div><div><dt>Hours</dt><dd>{item.notionalHours ?? "—"}</dd></div><div><dt>State</dt><dd><em className={`catalogue-state ${item.lifecycle}`}>{lifecycle(item.lifecycle)}</em></dd></div></dl>{canApprove && item.lifecycle !== "approved" ? <ApprovalButton institutionId={institutionId} kind="blueprints" record={item}/> : null}</article>)}</div> : <div className="catalogue-empty"><strong>No course blueprints yet</strong><p>Blueprints preserve approved delivery intent before content authoring begins.</p></div>}
      </section>
      <section className="catalogue-outcomes">
        <header><div><p>OUTCOME LIBRARY</p><h2>Institution outcomes</h2></div><span>{workspace.outcomes.length}</span></header>
        <div>{workspace.outcomes.map((outcome) => <article key={outcome.id}><span>{outcome.code}</span><strong>{outcome.title}</strong><small>{outcome.outcomeType.replaceAll("-", " ")}{outcome.levelCode ? ` · ${outcome.levelCode}` : ""}</small></article>)}</div>
      </section>
      {canManage ? <aside className="catalogue-actions">
        <ActionPanel eyebrow="CURRICULUM" title="Create outcome"><MutationForm operation="outcomes" institutionId={institutionId} submitLabel="Create outcome" build={(form) => ({ code: String(form.get("code")).toUpperCase(), title: String(form.get("title")), description: String(form.get("description")), outcomeType: String(form.get("outcomeType")), levelCode: String(form.get("levelCode") || "") || undefined })}><label>Outcome code<input name="code" required minLength={2} maxLength={32}/></label><label>Title<input name="title" required minLength={3} maxLength={180}/></label><label>Description<textarea name="description" required minLength={10} maxLength={4000}/></label><label>Type<select name="outcomeType"><option value="knowledge">Knowledge</option><option value="skill">Skill</option><option value="competency">Competency</option><option value="graduate-attribute">Graduate attribute</option></select></label><label>Level code<input name="levelCode" maxLength={40}/></label></MutationForm></ActionPanel>
        <ActionPanel eyebrow="CATALOGUE" title="Create programme"><MutationForm operation="programmes" institutionId={institutionId} submitLabel="Create draft programme" build={(form) => ({ code: String(form.get("code")).toUpperCase(), title: String(form.get("title")), description: String(form.get("description")), programmeType: String(form.get("programmeType")), creditValue: form.get("creditValue") ? Number(form.get("creditValue")) : undefined, notionalHours: form.get("notionalHours") ? Number(form.get("notionalHours")) : undefined })}><label>Programme code<input name="code" required minLength={2} maxLength={32}/></label><label>Title<input name="title" required minLength={3} maxLength={200}/></label><label>Description<textarea name="description" required minLength={10} maxLength={8000}/></label><label>Model<select name="programmeType"><option value="qualification">Qualification</option><option value="learning-path">Learning path</option><option value="short-course">Short course</option><option value="grade-band">Grade band</option></select></label><div className="catalogue-form-row"><label>Credits<input type="number" min="0" step="0.5" name="creditValue"/></label><label>Notional hours<input type="number" min="0" name="notionalHours"/></label></div></MutationForm></ActionPanel>
        <ActionPanel eyebrow="BLUEPRINT" title="Create course"><MutationForm operation="blueprints" institutionId={institutionId} submitLabel="Create draft blueprint" build={(form) => ({ code: String(form.get("code")).toUpperCase(), title: String(form.get("title")), description: String(form.get("description")), subjectArea: String(form.get("subjectArea") || "") || undefined, deliveryModes: form.getAll("deliveryModes"), outcomeIds: form.getAll("outcomeIds") })}><label>Course code<input name="code" required minLength={2} maxLength={32}/></label><label>Title<input name="title" required minLength={3} maxLength={200}/></label><label>Description<textarea name="description" required minLength={10} maxLength={8000}/></label><label>Subject area<input name="subjectArea" maxLength={120}/></label><fieldset><legend>Delivery modes</legend><label><input type="checkbox" name="deliveryModes" value="in_person" defaultChecked/> In person</label><label><input type="checkbox" name="deliveryModes" value="online"/> Online</label><label><input type="checkbox" name="deliveryModes" value="blended"/> Blended</label><label><input type="checkbox" name="deliveryModes" value="workplace"/> Workplace</label></fieldset><label>Mapped outcomes<select name="outcomeIds" multiple required size={Math.min(6, Math.max(3, workspace.outcomes.length))}>{workspace.outcomes.filter((item) => item.status === "active").map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.title}</option>)}</select></label></MutationForm></ActionPanel>
      </aside> : null}
    </div>
  );
}

function DeliveryView({ institutionId, workspace, references, canManage }: { institutionId: string; workspace: CatalogueWorkspace; references: CatalogueReferences; canManage: boolean }) {
  const approvedBlueprints = workspace.blueprints.filter((item) => item.lifecycle === "approved");
  return <div className="catalogue-view-grid"><section className="catalogue-main-surface catalogue-wide"><header><div><p>DELIVERY RUNS</p><h2>Current and planned offerings</h2></div><span>{workspace.runs.length}</span></header>{workspace.runs.length ? <div className="run-table"><div className="run-head"><span>Offering</span><span>Window</span><span>Mode</span><span>Capacity</span><span>State</span></div>{workspace.runs.map((run) => <article key={run.id}><div><strong>{run.title}</strong><small>{run.code} · {run.classCount} classes</small></div><span>{formatDate(run.startsOn)}<small>to {formatDate(run.endsOn)}</small></span><span>{lifecycle(run.deliveryMode)}</span><span>{run.activeEnrolmentCount}{run.capacity ? ` / ${run.capacity}` : ""}</span><em className={`catalogue-state ${run.lifecycle}`}>{lifecycle(run.lifecycle)}</em></article>)}</div> : <div className="catalogue-empty"><strong>No delivery runs scheduled</strong><p>Approve a blueprint, then schedule it inside a published academic period.</p></div>}</section>{canManage ? <aside className="catalogue-actions"><ActionPanel eyebrow="DELIVERY" title="Schedule course run"><MutationForm operation="runs" institutionId={institutionId} submitLabel="Schedule run" build={(form) => ({ academicPeriodId: String(form.get("academicPeriodId")), blueprintVersionId: String(form.get("blueprintVersionId")), code: String(form.get("code")), title: String(form.get("title")), deliveryMode: String(form.get("deliveryMode")), startsOn: String(form.get("startsOn")), endsOn: String(form.get("endsOn")), capacity: form.get("capacity") ? Number(form.get("capacity")) : undefined })}><label>Academic period<select name="academicPeriodId" required><option value="">Select period</option>{references.academicPeriods.map((period) => <option key={period.id} value={period.id}>{period.code} · {period.title}</option>)}</select></label><label>Approved blueprint<select name="blueprintVersionId" required><option value="">Select blueprint</option>{approvedBlueprints.map((blueprint) => <option key={blueprint.id} value={blueprint.id}>{blueprint.code} · {blueprint.title}</option>)}</select></label><label>Run code<input name="code" required maxLength={40}/></label><label>Run title<input name="title" required maxLength={200}/></label><label>Delivery mode<select name="deliveryMode"><option value="in_person">In person</option><option value="online">Online</option><option value="blended">Blended</option><option value="workplace">Workplace</option></select></label><div className="catalogue-form-row"><label>Starts<input type="date" name="startsOn" required/></label><label>Ends<input type="date" name="endsOn" required/></label></div><label>Capacity<input type="number" name="capacity" min="1" max="100000"/></label></MutationForm></ActionPanel><ActionPanel eyebrow="GROUPING" title="Create cohort"><MutationForm operation="cohorts" institutionId={institutionId} submitLabel="Create cohort" build={(form) => ({ code: String(form.get("code")), title: String(form.get("title")), startsOn: String(form.get("startsOn") || "") || undefined, endsOn: String(form.get("endsOn") || "") || undefined })}><label>Cohort code<input name="code" required maxLength={40}/></label><label>Title<input name="title" required maxLength={160}/></label><div className="catalogue-form-row"><label>Starts<input type="date" name="startsOn"/></label><label>Ends<input type="date" name="endsOn"/></label></div></MutationForm></ActionPanel><ActionPanel eyebrow="SECTION" title="Create class"><MutationForm operation="classes" institutionId={institutionId} submitLabel="Create class" build={(form) => ({ courseRunId: String(form.get("courseRunId")), cohortId: String(form.get("cohortId") || "") || undefined, code: String(form.get("code")), title: String(form.get("title")), capacity: form.get("capacity") ? Number(form.get("capacity")) : undefined })}><label>Course run<select name="courseRunId" required><option value="">Select run</option>{workspace.runs.filter((run) => !["completed", "cancelled"].includes(run.lifecycle)).map((run) => <option key={run.id} value={run.id}>{run.code} · {run.title}</option>)}</select></label><label>Cohort<select name="cohortId"><option value="">No cohort</option>{references.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code} · {cohort.title}</option>)}</select></label><label>Class code<input name="code" required maxLength={40}/></label><label>Title<input name="title" required maxLength={160}/></label><label>Capacity<input type="number" name="capacity" min="1" max="100000"/></label></MutationForm></ActionPanel></aside> : null}</div>;
}

function EnrolmentView({ institutionId, workspace, references, canManage }: { institutionId: string; workspace: CatalogueWorkspace; references: CatalogueReferences; canManage: boolean }) {
  return <div className="catalogue-view-grid"><section className="catalogue-main-surface catalogue-wide"><header><div><p>ENROLMENT LEDGER</p><h2>Effective learner memberships</h2></div><span>{workspace.enrolments.length}</span></header>{workspace.enrolments.length ? <div className="enrolment-table"><div className="enrolment-head"><span>Learner</span><span>Course run</span><span>Enrolled</span><span>Status</span></div>{workspace.enrolments.map((item) => <article key={item.id}><div><strong>{item.learnerDisplayName}</strong><small>{item.learnerPersonId}</small></div><div><strong>{item.courseRunTitle}</strong><small>{item.courseRunId}</small></div><span>{formatDate(item.enrolledOn)}</span><em className={`catalogue-state ${item.status}`}>{item.status}</em></article>)}</div> : <div className="catalogue-empty"><strong>No enrolments yet</strong><p>Eligible learner profiles can be enrolled into available delivery runs.</p></div>}</section>{canManage ? <aside className="catalogue-actions"><ActionPanel eyebrow="REGISTRAR" title="Enrol learner"><MutationForm operation="enrolments" institutionId={institutionId} submitLabel="Create enrolment" build={(form) => ({ learnerPersonId: String(form.get("learnerPersonId")), courseRunId: String(form.get("courseRunId")), classSectionId: String(form.get("classSectionId") || "") || undefined, cohortId: String(form.get("cohortId") || "") || undefined, enrolledOn: String(form.get("enrolledOn")), status: String(form.get("status")) })}><label>Learner<select name="learnerPersonId" required><option value="">Select eligible learner</option>{references.eligibleLearners.map((learner) => <option key={learner.id} value={learner.id}>{learner.displayName} · {learner.learnerStatus}</option>)}</select></label><label>Course run<select name="courseRunId" required><option value="">Select run</option>{workspace.runs.filter((run) => ["scheduled", "open", "in_progress"].includes(run.lifecycle)).map((run) => <option key={run.id} value={run.id}>{run.code} · {run.title}</option>)}</select></label><label>Class section<select name="classSectionId"><option value="">Assign later</option>{references.classes.map((section) => <option key={section.id} value={section.id}>{section.code} · {section.title}</option>)}</select></label><label>Cohort<select name="cohortId"><option value="">No cohort</option>{references.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code} · {cohort.title}</option>)}</select></label><div className="catalogue-form-row"><label>Enrolled on<input type="date" name="enrolledOn" required defaultValue={new Date().toISOString().slice(0, 10)}/></label><label>Initial state<select name="status"><option value="active">Active</option><option value="pending">Pending</option><option value="waitlisted">Waitlisted</option></select></label></div></MutationForm></ActionPanel></aside> : null}</div>;
}

export function CatalogueWorkspaceView({ institutionId, workspace, references, roles }: { institutionId: string; workspace: CatalogueWorkspace; references: CatalogueReferences; roles: readonly BaselineRoleKey[] }) {
  const [view, setView] = useState<View>("curriculum");
  const roleSet = useMemo(() => new Set(roles), [roles]);
  const canManageCurriculum = ["tenant-owner", "institution-admin", "curriculum-manager"].some((role) => roleSet.has(role as BaselineRoleKey));
  const canApprove = canManageCurriculum;
  const canManageDelivery = ["tenant-owner", "institution-admin", "registrar", "course-manager"].some((role) => roleSet.has(role as BaselineRoleKey));
  const approved = workspace.blueprints.filter((item) => item.lifecycle === "approved").length;
  const activeEnrolments = workspace.enrolments.filter((item) => item.status === "active" && !item.effectiveUntil).length;
  return <div className="catalogue-workspace"><header className="catalogue-heading"><div><p>CATALOGUE · CURRICULUM · ENROLMENT</p><h1>Academic operations</h1><span>Govern definitions, schedule approved delivery and preserve every learner membership transition.</span></div><div className="catalogue-boundary"><small>Institution boundary</small><strong>{institutionId.slice(0, 8)}</strong></div></header><section className="catalogue-metrics"><article><span>Programme versions</span><strong>{workspace.programmes.length}</strong><small>{workspace.programmes.filter((item) => item.lifecycle === "approved").length} approved</small></article><article><span>Course blueprints</span><strong>{workspace.blueprints.length}</strong><small>{approved} effective</small></article><article><span>Delivery runs</span><strong>{workspace.runs.length}</strong><small>{workspace.runs.filter((item) => ["open", "in_progress"].includes(item.lifecycle)).length} live</small></article><article><span>Active enrolments</span><strong>{activeEnrolments}</strong><small>Current evidence</small></article></section><nav className="catalogue-tabs" aria-label="Academic operations views"><button className={view === "curriculum" ? "active" : ""} onClick={() => setView("curriculum")}>Curriculum</button><button className={view === "delivery" ? "active" : ""} onClick={() => setView("delivery")}>Delivery</button><button className={view === "enrolments" ? "active" : ""} onClick={() => setView("enrolments")}>Enrolments</button></nav>{view === "curriculum" ? <CurriculumView institutionId={institutionId} workspace={workspace} canManage={canManageCurriculum} canApprove={canApprove}/> : null}{view === "delivery" ? <DeliveryView institutionId={institutionId} workspace={workspace} references={references} canManage={canManageDelivery}/> : null}{view === "enrolments" ? <EnrolmentView institutionId={institutionId} workspace={workspace} references={references} canManage={canManageDelivery}/> : null}</div>;
}
