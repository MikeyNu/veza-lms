"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { CatalogueReferences } from "@veza/contracts";
import type { AcademicEvidenceWorkspace } from "../../server/academic-evidence-api";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

function records(row: Readonly<Record<string, unknown>>, key: string) {
  const current = row[key];
  return Array.isArray(current) ? (current as Readonly<Record<string, unknown>>[]) : [];
}

async function mutate(operation: string, input: Record<string, unknown>) {
  const response = await fetch(`/api/academic/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.message === "string" ? body.message : "Academic operation failed");
  }
  return body;
}

function ActionForm({
  operation,
  institutionId,
  label,
  build,
  children,
}: {
  operation: string;
  institutionId?: string;
  label: string;
  build: (data: FormData) => Record<string, unknown>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await mutate(operation, {
        ...(institutionId ? { institutionId } : {}),
        ...build(new FormData(event.currentTarget)),
      });
      event.currentTarget.reset();
      setMessage("Recorded");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="vz-governance-form" onSubmit={submit}>
      {children}
      {message ? <p role="status">{message}</p> : null}
      <button disabled={saving}>{saving ? "Saving..." : label}</button>
    </form>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="vz-action-panel">
      <summary>
        {title}
        <span aria-hidden="true">+</span>
      </summary>
      {children}
    </details>
  );
}

export function AssessmentGovernanceCompletion({
  institutionId,
  workspace,
  references,
  canApprove,
  canRelease,
}: {
  institutionId: string;
  workspace: AcademicEvidenceWorkspace;
  references: CatalogueReferences;
  canApprove: boolean;
  canRelease: boolean;
}) {
  const approvedRubrics = workspace.rubrics.filter((rubric) => value(rubric, "status") === "approved");
  const draftAssignments = workspace.assignments.filter((assignment) => value(assignment, "status") === "draft");
  const groupAssignments = workspace.assignments.filter((assignment) => value(assignment, "groupMode") === "group");
  const markableSubmissions = workspace.submissions.filter((submission) =>
    ["submitted", "accepted"].includes(value(submission, "status")),
  );

  return (
    <section className="vz-completion-workspace" aria-labelledby="assessment-governance-title">
      <header>
        <div>
          <p>ASSESSMENT GOVERNANCE</p>
          <h2 id="assessment-governance-title">Rubrics, groups, marking and release</h2>
          <span>Independent approvals and released results remain linked to immutable submission evidence.</span>
        </div>
        <strong>{workspace.rubrics.length} rubrics</strong>
      </header>

      <div className="vz-completion-grid">
        <section className="vz-record-surface">
          <header>
            <div><p>RUBRIC REGISTER</p><h3>Governed scoring instruments</h3></div>
            <span>{workspace.rubrics.length}</span>
          </header>
          {workspace.rubrics.map((rubric) => (
            <article key={value(rubric, "id")}>
              <div>
                <small>{value(rubric, "status").replaceAll("_", " ")}</small>
                <strong>{value(rubric, "title")}</strong>
                <span>{records(rubric, "criteria").length} criteria</span>
              </div>
              <dl>
                <div><dt>Version</dt><dd>v{value(rubric, "version")}</dd></div>
                <div><dt>Submitted</dt><dd>{value(rubric, "submittedAt") ? "Yes" : "No"}</dd></div>
                <div><dt>Approved</dt><dd>{value(rubric, "approvedAt") ? "Yes" : "No"}</dd></div>
              </dl>
            </article>
          ))}
          {!workspace.rubrics.length ? <div className="vz-empty-state"><strong>No rubric</strong><p>Create a structured scoring instrument before publishing assessed work.</p></div> : null}
        </section>

        <aside className="vz-governance-rail">
          <Panel title="Create rubric">
            <ActionForm
              operation="rubric-create"
              institutionId={institutionId}
              label="Create draft rubric"
              build={(data) => ({
                title: String(data.get("title")),
                criteria: [{
                  sequenceNumber: 1,
                  title: String(data.get("criterionTitle")),
                  description: String(data.get("criterionDescription") || "") || undefined,
                  maximumScore: Number(data.get("maximumScore")),
                  levels: [
                    { label: "Exemplary", minimumPercent: 80 },
                    { label: "Proficient", minimumPercent: 60 },
                    { label: "Developing", minimumPercent: 40 },
                    { label: "Insufficient", minimumPercent: 0 },
                  ],
                }],
              })}
            >
              <label>Rubric title<input name="title" required minLength={3} maxLength={160} /></label>
              <label>First criterion<input name="criterionTitle" required minLength={2} /></label>
              <label>Criterion description<textarea name="criterionDescription" /></label>
              <label>Maximum score<input type="number" name="maximumScore" min="0.01" step="0.01" required /></label>
            </ActionForm>
          </Panel>

          <Panel title="Submit rubric for review">
            <ActionForm
              operation="rubric-submit"
              institutionId={institutionId}
              label="Submit rubric"
              build={(data) => ({
                rubricId: String(data.get("rubricId")),
                expectedVersion: Number(data.get("expectedVersion")),
                reason: String(data.get("reason")),
              })}
            >
              <label>Draft rubric<select name="rubricId" required onChange={(event) => {
                const form = event.currentTarget.form;
                const rubric = workspace.rubrics.find((item) => value(item, "id") === event.target.value);
                if (form && rubric) (form.elements.namedItem("expectedVersion") as HTMLInputElement).value = value(rubric, "version");
              }}><option value="">Select rubric</option>{workspace.rubrics.filter((item) => value(item, "status") === "draft").map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
              <input type="hidden" name="expectedVersion" />
              <label>Review reason<textarea name="reason" required minLength={10} /></label>
            </ActionForm>
          </Panel>

          {canApprove ? <Panel title="Approve reviewed rubric">
            <ActionForm
              operation="rubric-approve"
              institutionId={institutionId}
              label="Approve rubric"
              build={(data) => ({
                rubricId: String(data.get("rubricId")),
                expectedVersion: Number(data.get("expectedVersion")),
                notes: String(data.get("notes")),
              })}
            >
              <label>In-review rubric<select name="rubricId" required onChange={(event) => {
                const form = event.currentTarget.form;
                const rubric = workspace.rubrics.find((item) => value(item, "id") === event.target.value);
                if (form && rubric) (form.elements.namedItem("expectedVersion") as HTMLInputElement).value = value(rubric, "version");
              }}><option value="">Select rubric</option>{workspace.rubrics.filter((item) => value(item, "status") === "in_review").map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
              <input type="hidden" name="expectedVersion" />
              <label>Approval notes<textarea name="notes" required minLength={10} /></label>
            </ActionForm>
          </Panel> : null}

          <Panel title="Attach approved rubric">
            <ActionForm
              operation="rubric-attach"
              institutionId={institutionId}
              label="Attach rubric"
              build={(data) => ({
                assignmentId: String(data.get("assignmentId")),
                rubricId: String(data.get("rubricId")),
                expectedAssignmentVersion: Number(data.get("expectedAssignmentVersion")),
              })}
            >
              <label>Draft assignment<select name="assignmentId" required onChange={(event) => {
                const form = event.currentTarget.form;
                const assignment = draftAssignments.find((item) => value(item, "id") === event.target.value);
                if (form && assignment) (form.elements.namedItem("expectedAssignmentVersion") as HTMLInputElement).value = value(assignment, "version");
              }}><option value="">Select assignment</option>{draftAssignments.map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
              <input type="hidden" name="expectedAssignmentVersion" />
              <label>Approved rubric<select name="rubricId" required><option value="">Select rubric</option>{approvedRubrics.map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
            </ActionForm>
          </Panel>

          <Panel title="Create assignment group">
            <ActionForm
              operation="assignment-group-create"
              institutionId={institutionId}
              label="Create group"
              build={(data) => ({
                assignmentId: String(data.get("assignmentId")),
                name: String(data.get("name")),
                learnerPersonIds: data.getAll("learnerPersonIds").map(String),
              })}
            >
              <label>Group assignment<select name="assignmentId" required><option value="">Select assignment</option>{groupAssignments.map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
              <label>Group name<input name="name" required minLength={2} /></label>
              <label>Learners<select name="learnerPersonIds" multiple required size={6}>{references.eligibleLearners.map((learner) => <option key={learner.id} value={learner.id}>{learner.displayName}</option>)}</select></label>
            </ActionForm>
          </Panel>
        </aside>
      </div>

      <div className="vz-completion-grid">
        <section className="vz-record-surface">
          <header><div><p>MARKING QUEUE</p><h3>Feedback and release evidence</h3></div><span>{markableSubmissions.length}</span></header>
          {markableSubmissions.map((submission) => (
            <article key={value(submission, "id")}>
              <div><small>{value(submission, "assignmentTitle")}</small><strong>{value(submission, "learnerName")}</strong><span>Attempt {value(submission, "attemptNumber")}</span></div>
              <dl>
                <div><dt>Mark</dt><dd>{value(submission, "score") || "Pending"}</dd></div>
                <div><dt>Status</dt><dd>{value(submission, "markStatus") || "Unallocated"}</dd></div>
                <div><dt>Files</dt><dd>{value(submission, "fileCount")}</dd></div>
              </dl>
            </article>
          ))}
        </section>
        <aside className="vz-governance-rail">
          <Panel title="Allocate marker">
            <ActionForm operation="marker-allocate" label="Allocate marker" build={(data) => ({
              attemptId: String(data.get("attemptId")),
              markerPersonId: String(data.get("markerPersonId")),
              allocationRole: String(data.get("allocationRole")),
            })}>
              <label>Submission<select name="attemptId" required>{markableSubmissions.map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"learnerName")} · {value(item,"assignmentTitle")}</option>)}</select></label>
              <label>Marker<select name="markerPersonId" required>{references.eligibleStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</select></label>
              <label>Role<select name="allocationRole"><option value="primary">Primary marker</option><option value="second">Second marker</option><option value="moderator">Moderator</option></select></label>
            </ActionForm>
          </Panel>

          <Panel title="Record mark and feedback">
            <ActionForm operation="mark-record" label="Record mark" build={(data) => ({
              attemptId: String(data.get("attemptId")),
              markerAllocationId: String(data.get("markerAllocationId")),
              score: Number(data.get("score")),
              rubricScores: { summary: String(data.get("rubricSummary")) },
              feedback: { learner: String(data.get("feedback")) },
              status: String(data.get("status")),
            })}>
              <label>Submission<select name="attemptId" required>{markableSubmissions.map((item) => <option key={value(item,"id")} value={value(item,"id")}>{value(item,"learnerName")} · {value(item,"assignmentTitle")}</option>)}</select></label>
              <label>Marker allocation ID<input name="markerAllocationId" required /></label>
              <label>Score<input type="number" name="score" min="0" step="0.01" required /></label>
              <label>Rubric summary<textarea name="rubricSummary" required /></label>
              <label>Learner feedback<textarea name="feedback" required minLength={3} /></label>
              <label>State<select name="status"><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="moderated">Moderated</option></select></label>
            </ActionForm>
          </Panel>

          {canRelease ? <Panel title="Release result">
            <ActionForm operation="mark-release" label="Release result" build={(data) => ({
              markId: String(data.get("markId")),
              expectedVersion: Number(data.get("expectedVersion")),
              reason: String(data.get("reason")),
            })}>
              <label>Submitted mark<select name="markId" required onChange={(event) => {
                const form = event.currentTarget.form;
                const submission = workspace.submissions.find((item) => value(item, "markId") === event.target.value);
                if (form && submission) (form.elements.namedItem("expectedVersion") as HTMLInputElement).value = value(submission, "markVersion");
              }}><option value="">Select mark</option>{workspace.submissions.filter((item) => ["submitted","moderated"].includes(value(item,"markStatus"))).map((item) => <option key={value(item,"markId")} value={value(item,"markId")}>{value(item,"learnerName")} · {value(item,"assignmentTitle")}</option>)}</select></label>
              <input type="hidden" name="expectedVersion" />
              <label>Release reason<textarea name="reason" required minLength={10} /></label>
            </ActionForm>
          </Panel> : null}
        </aside>
      </div>
    </section>
  );
}

export function CredentialGovernanceCompletion({
  institutionId,
  workspace,
  references,
  canApprove,
}: {
  institutionId: string;
  workspace: AcademicEvidenceWorkspace;
  references: CatalogueReferences;
  canApprove: boolean;
}) {
  const [evaluation, setEvaluation] = useState<Record<string, unknown> | null>(null);
  const router = useRouter();

  return (
    <section className="vz-completion-workspace" aria-labelledby="credential-governance-title">
      <header><div><p>CREDENTIAL GOVERNANCE</p><h2 id="credential-governance-title">Templates, eligibility and issuance</h2><span>Every credential is backed by an independently approved template and a persisted eligibility snapshot.</span></div><strong>{workspace.certificateTemplates.length} templates</strong></header>
      <div className="vz-completion-grid">
        <section className="vz-record-surface">
          <header><div><p>TEMPLATE AND RULE REGISTER</p><h3>Controlled award definitions</h3></div><span>{workspace.awardRules.length}</span></header>
          {workspace.certificateTemplates.map((template) => <article key={value(template,"id")}><div><small>{value(template,"status")}</small><strong>{value(template,"title")}</strong><span>Template v{value(template,"version")}</span></div><dl><div><dt>Submitted</dt><dd>{value(template,"submittedAt") ? "Yes" : "No"}</dd></div><div><dt>Approved</dt><dd>{value(template,"approvedAt") ? "Yes" : "No"}</dd></div></dl></article>)}
          {workspace.awardRules.map((rule) => <article key={value(rule,"id")}><div><small>Award rule</small><strong>{value(rule,"templateTitle")}</strong><span>{value(rule,"eligibleCount")} eligible evaluations</span></div><dl><div><dt>Status</dt><dd>{value(rule,"status")}</dd></div><div><dt>Evaluations</dt><dd>{value(rule,"evaluationCount")}</dd></div></dl></article>)}
        </section>
        <aside className="vz-governance-rail">
          <Panel title="Create certificate template">
            <ActionForm operation="certificate-template" institutionId={institutionId} label="Create template" build={(data) => ({ title: String(data.get("title")), documentSchema: { layout: "formal-certificate", title: String(data.get("credentialTitle")), fields: ["learnerName","credentialTitle","issuedAt","verificationCode"] } })}>
              <label>Template name<input name="title" required minLength={3} /></label>
              <label>Credential title<input name="credentialTitle" required minLength={3} /></label>
            </ActionForm>
          </Panel>
          <Panel title="Submit certificate template">
            <ActionForm operation="certificate-template-submit" institutionId={institutionId} label="Submit template" build={(data) => ({ templateId: String(data.get("templateId")), expectedVersion: Number(data.get("expectedVersion")), reason: String(data.get("reason")) })}>
              <label>Draft template<select name="templateId" required onChange={(event) => { const form=event.currentTarget.form; const item=workspace.certificateTemplates.find((row)=>value(row,"id")===event.target.value); if(form&&item)(form.elements.namedItem("expectedVersion") as HTMLInputElement).value=value(item,"version"); }}><option value="">Select template</option>{workspace.certificateTemplates.filter((item)=>value(item,"status")==="draft").map((item)=><option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
              <input type="hidden" name="expectedVersion" />
              <label>Review reason<textarea name="reason" required minLength={10} /></label>
            </ActionForm>
          </Panel>
          {canApprove ? <Panel title="Approve certificate template">
            <ActionForm operation="certificate-template-approve" institutionId={institutionId} label="Approve template" build={(data) => ({ templateId: String(data.get("templateId")), expectedVersion: Number(data.get("expectedVersion")), notes: String(data.get("notes")) })}>
              <label>In-review template<select name="templateId" required onChange={(event) => { const form=event.currentTarget.form; const item=workspace.certificateTemplates.find((row)=>value(row,"id")===event.target.value); if(form&&item)(form.elements.namedItem("expectedVersion") as HTMLInputElement).value=value(item,"version"); }}><option value="">Select template</option>{workspace.certificateTemplates.filter((item)=>value(item,"status")==="in_review").map((item)=><option key={value(item,"id")} value={value(item,"id")}>{value(item,"title")}</option>)}</select></label>
              <input type="hidden" name="expectedVersion" />
              <label>Approval notes<textarea name="notes" required minLength={10} /></label>
            </ActionForm>
          </Panel> : null}
          <Panel title="Evaluate award eligibility">
            <form className="vz-governance-form" onSubmit={async (event) => { event.preventDefault(); const data=new FormData(event.currentTarget); try { const result=await mutate("award-evaluate",{institutionId,awardRuleId:String(data.get("awardRuleId")),learnerPersonId:String(data.get("learnerPersonId")),enrolmentId:String(data.get("enrolmentId")||"")||undefined,persistEvaluation:true}); setEvaluation(result); router.refresh(); } catch(error){setEvaluation({error:error instanceof Error?error.message:"Evaluation failed"});} }}>
              <label>Award rule<select name="awardRuleId" required>{workspace.awardRules.filter((item)=>value(item,"status")==="active").map((item)=><option key={value(item,"id")} value={value(item,"id")}>{value(item,"templateTitle")}</option>)}</select></label>
              <label>Learner<select name="learnerPersonId" required>{references.eligibleLearners.map((learner)=><option key={learner.id} value={learner.id}>{learner.displayName}</option>)}</select></label>
              <label>Enrolment ID<input name="enrolmentId" /></label>
              <button>Evaluate and preserve evidence</button>
              {evaluation ? <pre className="vz-evaluation-result">{JSON.stringify(evaluation,null,2)}</pre> : null}
            </form>
          </Panel>
          {evaluation && evaluation.eligible === true && typeof evaluation.id === "string" ? <Panel title="Issue evaluated certificate">
            <ActionForm operation="certificate-issue" institutionId={institutionId} label="Issue credential" build={(data) => ({ learnerPersonId:String(data.get("learnerPersonId")),enrolmentId:String(data.get("enrolmentId")||"")||undefined,awardRuleId:String(data.get("awardRuleId")),awardEvaluationId:String(evaluation.id) })}>
              <label>Award rule<select name="awardRuleId" required>{workspace.awardRules.filter((item)=>value(item,"status")==="active").map((item)=><option key={value(item,"id")} value={value(item,"id")}>{value(item,"templateTitle")}</option>)}</select></label>
              <label>Learner<select name="learnerPersonId" required>{references.eligibleLearners.map((learner)=><option key={learner.id} value={learner.id}>{learner.displayName}</option>)}</select></label>
              <label>Enrolment ID<input name="enrolmentId" /></label>
            </ActionForm>
          </Panel> : null}
        </aside>
      </div>
    </section>
  );
}
