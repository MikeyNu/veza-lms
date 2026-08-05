"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  BaselineRoleKey,
  CatalogueReferences,
  CatalogueWorkspace,
  CourseBlueprintSummary,
  CurriculumAnalysis,
  CurriculumHistory,
  ProgrammeVersionSummary,
} from "@veza/contracts";

type View = "curriculum" | "delivery" | "enrolments";
type CurriculumKind = "programmes" | "blueprints";

type ReviewState = Readonly<{
  analysis?: CurriculumAnalysis;
  history?: CurriculumHistory;
  error?: string;
  loading?: boolean;
}>;

function formatDate(value?: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

async function jsonRequest(
  path: string,
  method: "GET" | "POST",
  input?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: input ? { "content-type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof body.message === "string" ? body.message : "Curriculum operation failed",
    );
  }
  return body;
}

function ActionPanel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="catalogue-action-panel">
      <summary>
        <span>
          <small>{eyebrow}</small>
          <strong>{title}</strong>
        </span>
        <b aria-hidden="true">＋</b>
      </summary>
      {children}
    </details>
  );
}

function OperationForm({
  path,
  institutionId,
  submitLabel,
  buildInput,
  children,
}: {
  path: string;
  institutionId: string;
  submitLabel: string;
  buildInput: (form: FormData) => Record<string, unknown>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    try {
      await jsonRequest(path, "POST", {
        institutionId,
        ...buildInput(new FormData(event.currentTarget)),
      });
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
      {message ? (
        <p className="catalogue-error" role="alert">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function ReviewDrawer({
  analysis,
  history,
}: {
  analysis?: CurriculumAnalysis;
  history?: CurriculumHistory;
}) {
  if (!analysis && !history) return null;
  return (
    <div className="curriculum-review-drawer">
      {analysis ? (
        <>
          <header>
            <div>
              <small>IMPACT REVIEW</small>
              <strong>
                {analysis.validation.passed
                  ? "No blocking validation findings"
                  : `${analysis.validation.errors.length} blocking findings`}
              </strong>
            </div>
            <span className={analysis.validation.passed ? "passed" : "blocked"}>
              {analysis.validation.passed ? "PASS" : "BLOCKED"}
            </span>
          </header>
          <div className="curriculum-review-metrics">
            <article>
              <span>Review ID</span>
              <code>{analysis.reviewId.slice(0, 12)}…</code>
            </article>
            <article>
              <span>Warnings</span>
              <strong>{analysis.validation.warnings.length}</strong>
            </article>
            <article>
              <span>Version checked</span>
              <strong>{analysis.resourceVersion}</strong>
            </article>
          </div>
          {analysis.validation.errors.length || analysis.validation.warnings.length ? (
            <ul className="curriculum-review-findings">
              {[...analysis.validation.errors, ...analysis.validation.warnings].map(
                (issue) => (
                  <li key={`${issue.severity}-${issue.code}`}>
                    <b>{issue.severity}</b>
                    <div>
                      <strong>{issue.message}</strong>
                      <small>
                        {issue.code}
                        {issue.field ? ` · ${issue.field}` : ""}
                      </small>
                    </div>
                  </li>
                ),
              )}
            </ul>
          ) : null}
          <details className="curriculum-review-json">
            <summary>Outcome coverage and dependency impact</summary>
            <pre>
              {JSON.stringify(
                {
                  outcomeCoverage: analysis.outcomeCoverage,
                  impact: analysis.impact,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      ) : null}
      {history ? (
        <details className="curriculum-history" open={!analysis}>
          <summary>
            Historical reconstruction · {history.versions.length} versions · {history.reviews.length} reviews
          </summary>
          <div>
            {history.versions.map((version, index) => (
              <article key={String(version.id ?? index)}>
                <strong>
                  Version {String(version.version_number ?? "?")} · {label(String(version.lifecycle ?? "unknown"))}
                </strong>
                <span>
                  {formatDate(
                    typeof version.effective_from === "string"
                      ? version.effective_from
                      : undefined,
                  )}
                </span>
                <small>
                  {typeof version.approval_review_id === "string"
                    ? `Review ${version.approval_review_id.slice(0, 12)}…`
                    : "No approval review"}
                </small>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CurriculumLifecycle({
  institutionId,
  kind,
  item,
  canSubmit,
  canApprove,
}: {
  institutionId: string;
  kind: CurriculumKind;
  item: ProgrammeVersionSummary | CourseBlueprintSummary;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewState>({});
  const [state, setState] = useState<"idle" | "saving">("idle");
  const basePath = `/api/catalogue/curriculum/${kind}/${item.id}`;

  async function analyse() {
    setReview((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const result = (await jsonRequest(`${basePath}/analysis`, "POST", {
        institutionId,
      })) as unknown as CurriculumAnalysis;
      setReview((current) => ({ ...current, loading: false, analysis: result }));
    } catch (error) {
      setReview((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      }));
    }
  }

  async function history() {
    setReview((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const result = (await jsonRequest(
        `${basePath}/history?institutionId=${institutionId}`,
        "GET",
      )) as unknown as CurriculumHistory;
      setReview((current) => ({ ...current, loading: false, history: result }));
    } catch (error) {
      setReview((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "History failed",
      }));
    }
  }

  async function submitReview() {
    setState("saving");
    try {
      const result = await jsonRequest(`${basePath}/submit`, "POST", {
        institutionId,
        expectedVersion: item.version,
      });
      setReview((current) => ({
        ...current,
        analysis: {
          reviewId: String(result.reviewId),
          resourceType:
            kind === "programmes"
              ? "programme-version"
              : "course-blueprint-version",
          resourceId: item.id,
          resourceVersion: Number(result.version),
          validation: result.validation as CurriculumAnalysis["validation"],
          outcomeCoverage: {},
          impact: {},
        },
      }));
      router.refresh();
    } catch (error) {
      setReview((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Submission failed",
      }));
    } finally {
      setState("idle");
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    const form = new FormData(event.currentTarget);
    try {
      let currentReview = review.analysis;
      if (!currentReview || currentReview.resourceVersion !== item.version) {
        currentReview = (await jsonRequest(`${basePath}/analysis`, "POST", {
          institutionId,
        })) as unknown as CurriculumAnalysis;
        setReview((current) => ({ ...current, analysis: currentReview }));
      }
      if (!currentReview.validation.passed) {
        throw new Error("Approval is blocked by the current curriculum review");
      }
      await jsonRequest(`${basePath}/approve`, "POST", {
        institutionId,
        expectedVersion: item.version,
        approvalReviewId: currentReview.reviewId,
        effectiveFrom: form.get("effectiveFrom"),
        effectiveUntil: form.get("effectiveUntil") || undefined,
        approvalNotes: form.get("approvalNotes"),
      });
      router.refresh();
    } catch (error) {
      setReview((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Approval failed",
      }));
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="curriculum-lifecycle">
      <div className="curriculum-lifecycle-actions">
        <button type="button" onClick={analyse} disabled={review.loading}>
          {review.loading ? "Reviewing…" : "Run impact review"}
        </button>
        <button type="button" onClick={history} disabled={review.loading}>
          Version history
        </button>
        {item.lifecycle === "draft" && canSubmit ? (
          <button type="button" onClick={submitReview} disabled={state === "saving"}>
            {state === "saving" ? "Submitting…" : "Submit for review"}
          </button>
        ) : null}
      </div>
      {item.lifecycle === "in_review" && canApprove ? (
        <details className="curriculum-approval-form">
          <summary>Approve reviewed version</summary>
          <form onSubmit={approve}>
            <label>
              Effective from
              <input name="effectiveFrom" type="date" required />
            </label>
            <label>
              Effective until
              <input name="effectiveUntil" type="date" />
            </label>
            <label>
              Approval notes
              <textarea name="approvalNotes" minLength={20} maxLength={1000} required />
            </label>
            <button disabled={state === "saving"}>
              {state === "saving" ? "Approving…" : "Approve with current review"}
            </button>
          </form>
        </details>
      ) : null}
      {review.error ? (
        <p className="catalogue-error" role="alert">
          {review.error}
        </p>
      ) : null}
      <ReviewDrawer analysis={review.analysis} history={review.history} />
    </div>
  );
}

function CurriculumView({
  institutionId,
  workspace,
  roles,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  roles: readonly BaselineRoleKey[];
}) {
  const canManage = roles.some((role) =>
    ["tenant-owner", "institution-admin", "curriculum-manager"].includes(role),
  );
  const canApprove = roles.some((role) =>
    ["tenant-owner", "institution-admin"].includes(role),
  );
  const approvedBlueprints = workspace.blueprints.filter(
    (blueprint) => blueprint.lifecycle === "approved",
  );
  const parentDefinitions = workspace.blueprints.filter((blueprint) =>
    ["subject", "module", "course"].includes(blueprint.definitionType),
  );

  return (
    <div className="catalogue-view-grid curriculum-governance-grid">
      <section className="catalogue-main-surface">
        <header>
          <div>
            <p>PROGRAMME GOVERNANCE</p>
            <h2>Programme versions</h2>
          </div>
          <span>{workspace.programmes.length}</span>
        </header>
        {workspace.programmes.length ? (
          <div className="catalogue-record-list curriculum-records">
            {workspace.programmes.map((programme) => (
              <article key={programme.id}>
                <div className="catalogue-code">{programme.code}</div>
                <div>
                  <strong>{programme.title}</strong>
                  <small>
                    {label(programme.programmeType)} · version {programme.versionNumber}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Credit</dt>
                    <dd>{programme.creditValue ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Hours</dt>
                    <dd>{programme.notionalHours ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Courses</dt>
                    <dd>{programme.courseCount}</dd>
                  </div>
                </dl>
                <em className={`catalogue-state ${programme.lifecycle}`}>
                  {label(programme.lifecycle)}
                </em>
                <CurriculumLifecycle
                  institutionId={institutionId}
                  kind="programmes"
                  item={programme}
                  canSubmit={canManage}
                  canApprove={canApprove}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="catalogue-empty">
            <strong>No programme versions</strong>
            <p>Create the institution programme before scheduling delivery.</p>
          </div>
        )}
      </section>

      <section className="catalogue-main-surface">
        <header>
          <div>
            <p>CURRICULUM DEFINITIONS</p>
            <h2>Subjects, modules, courses and units</h2>
          </div>
          <span>{workspace.blueprints.length}</span>
        </header>
        {workspace.blueprints.length ? (
          <div className="catalogue-record-list curriculum-records">
            {workspace.blueprints.map((blueprint) => (
              <article key={blueprint.id}>
                <div className="catalogue-code">{blueprint.code}</div>
                <div>
                  <strong>{blueprint.title}</strong>
                  <small>
                    {label(blueprint.definitionType)} · version {blueprint.versionNumber}
                    {blueprint.parentDefinitionId ? " · nested definition" : ""}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Outcomes</dt>
                    <dd>{blueprint.outcomeCount}</dd>
                  </div>
                  <div>
                    <dt>Requisites</dt>
                    <dd>{blueprint.requisiteCount}</dd>
                  </div>
                  <div>
                    <dt>Hours</dt>
                    <dd>{blueprint.notionalHours ?? "—"}</dd>
                  </div>
                </dl>
                <em className={`catalogue-state ${blueprint.lifecycle}`}>
                  {label(blueprint.lifecycle)}
                </em>
                <CurriculumLifecycle
                  institutionId={institutionId}
                  kind="blueprints"
                  item={blueprint}
                  canSubmit={canManage}
                  canApprove={canApprove}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="catalogue-empty">
            <strong>No curriculum definitions</strong>
            <p>Create outcomes first, then define a subject, module, course or unit.</p>
          </div>
        )}
      </section>

      <section className="catalogue-outcomes">
        <header>
          <div>
            <p>OUTCOME LIBRARY</p>
            <h2>Institution learning outcomes and competencies</h2>
          </div>
          <span>{workspace.outcomes.length}</span>
        </header>
        <div>
          {workspace.outcomes.map((outcome) => (
            <article key={outcome.id}>
              <span>{outcome.code}</span>
              <strong>{outcome.title}</strong>
              <small>
                {label(outcome.outcomeType)}
                {outcome.levelCode ? ` · ${outcome.levelCode}` : ""}
              </small>
            </article>
          ))}
        </div>
      </section>

      {canManage ? (
        <aside className="catalogue-actions">
          <ActionPanel eyebrow="OUTCOME" title="Create learning outcome">
            <OperationForm
              path="/api/catalogue/outcomes"
              institutionId={institutionId}
              submitLabel="Create outcome"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                description: form.get("description"),
                outcomeType: form.get("outcomeType"),
                levelCode: form.get("levelCode") || undefined,
              })}
            >
              <label>
                Code
                <input name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,31}" required />
              </label>
              <label>
                Title
                <input name="title" minLength={3} maxLength={180} required />
              </label>
              <label>
                Description
                <textarea name="description" minLength={10} maxLength={4000} required />
              </label>
              <label>
                Outcome type
                <select name="outcomeType" defaultValue="knowledge">
                  <option value="knowledge">Knowledge</option>
                  <option value="skill">Skill</option>
                  <option value="competency">Competency</option>
                  <option value="graduate-attribute">Graduate attribute</option>
                </select>
              </label>
              <label>
                Level code
                <input name="levelCode" maxLength={40} />
              </label>
            </OperationForm>
          </ActionPanel>

          <ActionPanel eyebrow="PROGRAMME" title="Create programme version">
            <OperationForm
              path="/api/catalogue/programmes"
              institutionId={institutionId}
              submitLabel="Create programme"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                description: form.get("description"),
                programmeType: form.get("programmeType"),
                creditValue:
                  String(form.get("creditValue") ?? "").trim() || undefined,
                notionalHours:
                  String(form.get("notionalHours") ?? "").trim() || undefined,
                durationValue:
                  String(form.get("durationValue") ?? "").trim() || undefined,
                durationUnit: form.get("durationUnit") || undefined,
              })}
            >
              <label>
                Code
                <input name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,31}" required />
              </label>
              <label>
                Title
                <input name="title" minLength={3} maxLength={200} required />
              </label>
              <label>
                Description
                <textarea name="description" minLength={10} maxLength={8000} required />
              </label>
              <label>
                Programme type
                <select name="programmeType" defaultValue="qualification">
                  <option value="qualification">Qualification</option>
                  <option value="learning-path">Learning path</option>
                  <option value="short-course">Short course</option>
                  <option value="grade-band">Grade band</option>
                </select>
              </label>
              <div className="catalogue-form-row">
                <label>
                  Credit
                  <input name="creditValue" type="number" min="0" step="0.5" />
                </label>
                <label>
                  Notional hours
                  <input name="notionalHours" type="number" min="0" />
                </label>
              </div>
              <div className="catalogue-form-row">
                <label>
                  Duration
                  <input name="durationValue" type="number" min="1" />
                </label>
                <label>
                  Duration unit
                  <select name="durationUnit" defaultValue="months">
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </label>
              </div>
            </OperationForm>
          </ActionPanel>

          <ActionPanel eyebrow="DEFINITION" title="Create subject, module, course or unit">
            <OperationForm
              path="/api/catalogue/blueprints"
              institutionId={institutionId}
              submitLabel="Create curriculum definition"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                description: form.get("description"),
                definitionType: form.get("definitionType"),
                parentDefinitionId: form.get("parentDefinitionId") || undefined,
                subjectArea: form.get("subjectArea") || undefined,
                creditValue:
                  String(form.get("creditValue") ?? "").trim() || undefined,
                notionalHours:
                  String(form.get("notionalHours") ?? "").trim() || undefined,
                deliveryModes: form.getAll("deliveryModes"),
                outcomeIds: form.getAll("outcomeIds"),
              })}
            >
              <label>
                Definition type
                <select name="definitionType" defaultValue="course">
                  <option value="subject">Subject</option>
                  <option value="module">Module</option>
                  <option value="course">Course</option>
                  <option value="unit">Unit</option>
                </select>
              </label>
              <label>
                Parent definition
                <select name="parentDefinitionId" defaultValue="">
                  <option value="">No parent</option>
                  {parentDefinitions.map((definition) => (
                    <option key={definition.courseDefinitionId} value={definition.courseDefinitionId}>
                      {definition.code} · {definition.title} · {label(definition.definitionType)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,31}" required />
              </label>
              <label>
                Title
                <input name="title" minLength={3} maxLength={200} required />
              </label>
              <label>
                Description
                <textarea name="description" minLength={10} maxLength={8000} required />
              </label>
              <label>
                Subject area
                <input name="subjectArea" maxLength={120} />
              </label>
              <div className="catalogue-form-row">
                <label>
                  Credit
                  <input name="creditValue" type="number" min="0" step="0.5" />
                </label>
                <label>
                  Notional hours
                  <input name="notionalHours" type="number" min="0" />
                </label>
              </div>
              <fieldset>
                <legend>Delivery modes</legend>
                {[
                  ["in_person", "In person"],
                  ["online", "Online"],
                  ["blended", "Blended"],
                  ["workplace", "Workplace"],
                ].map(([value, title]) => (
                  <label key={value}>
                    <input
                      name="deliveryModes"
                      type="checkbox"
                      value={value}
                      defaultChecked={value === "in_person"}
                    />
                    {title}
                  </label>
                ))}
              </fieldset>
              <label>
                Mapped outcomes
                <select name="outcomeIds" multiple required>
                  {workspace.outcomes.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>
                      {outcome.code} · {outcome.title}
                    </option>
                  ))}
                </select>
              </label>
            </OperationForm>
          </ActionPanel>

          <ActionPanel eyebrow="PROGRAMME" title="Set required programme outcome">
            <OperationForm
              path="/api/catalogue/curriculum/programmes/placeholder/outcome-requirements"
              institutionId={institutionId}
              submitLabel="Set outcome requirement"
              buildInput={() => ({})}
            >
              <p className="catalogue-form-note">
                Select a draft programme from the register, then use its contextual outcome-requirement control.
              </p>
            </OperationForm>
          </ActionPanel>

          <ActionPanel eyebrow="COMPOSITION" title="Add approved course to programme">
            <OperationForm
              path="/api/catalogue/governance/link-programme-course"
              institutionId={institutionId}
              submitLabel="Add course"
              buildInput={(form) => ({
                programmeVersionId: form.get("programmeVersionId"),
                courseBlueprintVersionId: form.get("courseBlueprintVersionId"),
                sequenceNumber: Number(form.get("sequenceNumber")),
                requirementType: form.get("requirementType"),
                creditContribution:
                  String(form.get("creditContribution") ?? "").trim() || undefined,
                expectedProgrammeVersion: Number(form.get("expectedProgrammeVersion")),
              })}
            >
              <label>
                Draft programme
                <select name="programmeVersionId" required defaultValue="">
                  <option value="" disabled>Select programme</option>
                  {workspace.programmes
                    .filter((programme) => programme.lifecycle !== "approved")
                    .map((programme) => (
                      <option key={programme.id} value={programme.id}>
                        {programme.code} · {programme.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Current programme version
                <select name="expectedProgrammeVersion" required defaultValue="">
                  <option value="" disabled>Select matching version</option>
                  {workspace.programmes
                    .filter((programme) => programme.lifecycle !== "approved")
                    .map((programme) => (
                      <option key={programme.id} value={programme.version}>
                        {programme.code} · aggregate v{programme.version}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Approved blueprint
                <select name="courseBlueprintVersionId" required defaultValue="">
                  <option value="" disabled>Select course blueprint</option>
                  {approvedBlueprints.map((blueprint) => (
                    <option key={blueprint.id} value={blueprint.id}>
                      {blueprint.code} · {blueprint.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="catalogue-form-row">
                <label>
                  Sequence
                  <input name="sequenceNumber" type="number" min="1" required />
                </label>
                <label>
                  Requirement
                  <select name="requirementType" defaultValue="required">
                    <option value="required">Required</option>
                    <option value="elective">Elective</option>
                    <option value="optional">Optional</option>
                  </select>
                </label>
              </div>
              <label>
                Credit contribution
                <input name="creditContribution" type="number" min="0" step="0.5" />
              </label>
            </OperationForm>
          </ActionPanel>

          <ActionPanel eyebrow="VALIDATION" title="Create curriculum validation policy">
            <OperationForm
              path="/api/catalogue/curriculum/validation-policies"
              institutionId={institutionId}
              submitLabel="Create draft policy"
              buildInput={(form) => ({
                creditRequired: form.get("creditRequired") === "on",
                notionalHoursRequired:
                  form.get("notionalHoursRequired") === "on",
                durationRequired: form.get("durationRequired") === "on",
                hoursPerCredit:
                  String(form.get("hoursPerCredit") ?? "").trim() || undefined,
                ratioTolerancePercent: Number(
                  form.get("ratioTolerancePercent") ?? 10,
                ),
                minimumCredit:
                  String(form.get("minimumCredit") ?? "").trim() || undefined,
                maximumCredit:
                  String(form.get("maximumCredit") ?? "").trim() || undefined,
                minimumNotionalHours:
                  String(form.get("minimumNotionalHours") ?? "").trim() ||
                  undefined,
                maximumNotionalHours:
                  String(form.get("maximumNotionalHours") ?? "").trim() ||
                  undefined,
              })}
            >
              <label className="catalogue-check">
                <input name="creditRequired" type="checkbox" /> Credit required
              </label>
              <label className="catalogue-check">
                <input name="notionalHoursRequired" type="checkbox" defaultChecked /> Notional hours required
              </label>
              <label className="catalogue-check">
                <input name="durationRequired" type="checkbox" /> Programme duration required
              </label>
              <div className="catalogue-form-row">
                <label>
                  Hours per credit
                  <input name="hoursPerCredit" type="number" min="0.01" step="0.01" />
                </label>
                <label>
                  Ratio tolerance %
                  <input
                    name="ratioTolerancePercent"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="10"
                  />
                </label>
              </div>
              <div className="catalogue-form-row">
                <label>
                  Minimum credit
                  <input name="minimumCredit" type="number" min="0" step="0.5" />
                </label>
                <label>
                  Maximum credit
                  <input name="maximumCredit" type="number" min="0.01" step="0.5" />
                </label>
              </div>
              <div className="catalogue-form-row">
                <label>
                  Minimum hours
                  <input name="minimumNotionalHours" type="number" min="0" />
                </label>
                <label>
                  Maximum hours
                  <input name="maximumNotionalHours" type="number" min="1" />
                </label>
              </div>
            </OperationForm>
          </ActionPanel>
        </aside>
      ) : null}
    </div>
  );
}

function DeliveryView({
  institutionId,
  workspace,
  references,
  canManage,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
  canManage: boolean;
}) {
  const approvedBlueprints = workspace.blueprints.filter(
    (blueprint) => blueprint.lifecycle === "approved",
  );
  return (
    <div className="catalogue-view-grid">
      <section className="catalogue-main-surface catalogue-wide">
        <header>
          <div>
            <p>DELIVERY REGISTER</p>
            <h2>Course runs and classes</h2>
          </div>
          <span>{workspace.runs.length}</span>
        </header>
        <div className="run-table">
          <div className="run-head">
            <span>Run</span>
            <span>Period</span>
            <span>Mode</span>
            <span>Capacity</span>
            <span>Status</span>
          </div>
          {workspace.runs.map((run) => (
            <article key={run.id}>
              <div>
                <strong>{run.title}</strong>
                <small>
                  {run.code} · {formatDate(run.startsOn)} to {formatDate(run.endsOn)}
                </small>
              </div>
              <span>
                {references.academicPeriods.find(
                  (period) => period.id === run.academicPeriodId,
                )?.title ?? run.academicPeriodId}
              </span>
              <span>{label(run.deliveryMode)}</span>
              <span>
                {run.activeEnrolmentCount}/{run.capacity ?? "∞"}
              </span>
              <em className={`catalogue-state ${run.lifecycle}`}>
                {label(run.lifecycle)}
              </em>
            </article>
          ))}
        </div>
      </section>
      {canManage ? (
        <aside className="catalogue-actions">
          <ActionPanel eyebrow="DELIVERY" title="Schedule course run">
            <OperationForm
              path="/api/catalogue/runs"
              institutionId={institutionId}
              submitLabel="Schedule run"
              buildInput={(form) => ({
                academicPeriodId: form.get("academicPeriodId"),
                blueprintVersionId: form.get("blueprintVersionId"),
                code: form.get("code"),
                title: form.get("title"),
                deliveryMode: form.get("deliveryMode"),
                startsOn: form.get("startsOn"),
                endsOn: form.get("endsOn"),
                capacity:
                  String(form.get("capacity") ?? "").trim() || undefined,
              })}
            >
              <label>
                Approved blueprint
                <select name="blueprintVersionId" required defaultValue="">
                  <option value="" disabled>Select blueprint</option>
                  {approvedBlueprints.map((blueprint) => (
                    <option key={blueprint.id} value={blueprint.id}>
                      {blueprint.code} · {blueprint.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Published academic period
                <select name="academicPeriodId" required defaultValue="">
                  <option value="" disabled>Select period</option>
                  {references.academicPeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.code} · {period.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Code
                <input name="code" required maxLength={40} />
              </label>
              <label>
                Title
                <input name="title" required maxLength={200} />
              </label>
              <label>
                Delivery mode
                <select name="deliveryMode" defaultValue="in_person">
                  <option value="in_person">In person</option>
                  <option value="online">Online</option>
                  <option value="blended">Blended</option>
                  <option value="workplace">Workplace</option>
                </select>
              </label>
              <div className="catalogue-form-row">
                <label>
                  Starts on
                  <input name="startsOn" type="date" required />
                </label>
                <label>
                  Ends on
                  <input name="endsOn" type="date" required />
                </label>
              </div>
              <label>
                Capacity
                <input name="capacity" type="number" min="1" />
              </label>
            </OperationForm>
          </ActionPanel>
        </aside>
      ) : null}
    </div>
  );
}

function EnrolmentView({
  institutionId,
  workspace,
  references,
  canManage,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
  canManage: boolean;
}) {
  const availableRuns = workspace.runs.filter((run) =>
    ["scheduled", "open", "in_progress"].includes(run.lifecycle),
  );
  return (
    <div className="catalogue-view-grid">
      <section className="catalogue-main-surface catalogue-wide">
        <header>
          <div>
            <p>EFFECTIVE-DATED MEMBERSHIP</p>
            <h2>Enrolment ledger</h2>
          </div>
          <span>{workspace.enrolments.length}</span>
        </header>
        <div className="enrolment-table">
          <div className="enrolment-head">
            <span>Learner</span>
            <span>Course run</span>
            <span>Enrolled</span>
            <span>Status</span>
          </div>
          {workspace.enrolments.map((enrolment) => (
            <article key={enrolment.id}>
              <div>
                <strong>{enrolment.learnerDisplayName}</strong>
                <small>{enrolment.learnerPersonId.slice(0, 12)}…</small>
              </div>
              <div>
                <strong>{enrolment.courseRunTitle}</strong>
                <small>{enrolment.courseRunId.slice(0, 12)}…</small>
              </div>
              <span>{formatDate(enrolment.enrolledOn)}</span>
              <em className={`catalogue-state ${enrolment.status}`}>
                {label(enrolment.status)}
              </em>
            </article>
          ))}
        </div>
      </section>
      {canManage ? (
        <aside className="catalogue-actions">
          <ActionPanel eyebrow="ENROLMENT" title="Enrol eligible learner">
            <OperationForm
              path="/api/catalogue/enrolments"
              institutionId={institutionId}
              submitLabel="Create enrolment"
              buildInput={(form) => ({
                learnerPersonId: form.get("learnerPersonId"),
                courseRunId: form.get("courseRunId"),
                classSectionId: form.get("classSectionId") || undefined,
                cohortId: form.get("cohortId") || undefined,
                enrolledOn: form.get("enrolledOn"),
                status: form.get("status"),
              })}
            >
              <label>
                Eligible learner
                <select name="learnerPersonId" required defaultValue="">
                  <option value="" disabled>Select learner</option>
                  {references.eligibleLearners.map((learner) => (
                    <option key={learner.id} value={learner.id}>
                      {learner.displayName} · {label(learner.learnerStatus)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Available course run
                <select name="courseRunId" required defaultValue="">
                  <option value="" disabled>Select run</option>
                  {availableRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.code} · {run.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Class section
                <select name="classSectionId" defaultValue="">
                  <option value="">No class assignment</option>
                  {references.classes.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.code} · {section.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cohort
                <select name="cohortId" defaultValue="">
                  <option value="">No cohort assignment</option>
                  {references.cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.code} · {cohort.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Enrolled on
                <input name="enrolledOn" type="date" required />
              </label>
              <label>
                Initial state
                <select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="waitlisted">Waitlisted</option>
                </select>
              </label>
            </OperationForm>
          </ActionPanel>
        </aside>
      ) : null}
    </div>
  );
}

export function CurriculumGovernanceWorkspace({
  institutionId,
  workspace,
  references,
  roles,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
  roles: readonly BaselineRoleKey[];
}) {
  const [view, setView] = useState<View>("curriculum");
  const canDeliveryManage = roles.some((role) =>
    ["tenant-owner", "institution-admin", "registrar", "course-manager"].includes(
      role,
    ),
  );
  const metrics = useMemo(
    () => ({
      approvedCurriculum:
        workspace.programmes.filter((item) => item.lifecycle === "approved").length +
        workspace.blueprints.filter((item) => item.lifecycle === "approved").length,
      reviewQueue:
        workspace.programmes.filter((item) => item.lifecycle === "in_review").length +
        workspace.blueprints.filter((item) => item.lifecycle === "in_review").length,
      activeRuns: workspace.runs.filter((run) =>
        ["open", "in_progress"].includes(run.lifecycle),
      ).length,
      activeEnrolments: workspace.enrolments.filter(
        (enrolment) => enrolment.status === "active",
      ).length,
    }),
    [workspace],
  );

  return (
    <div className="catalogue-workspace curriculum-governance-workspace">
      <header className="catalogue-heading">
        <div>
          <p>ACADEMIC OPERATIONS</p>
          <h1>Catalogue, curriculum and enrolment</h1>
          <span>
            Versioned curriculum definitions, impact-reviewed approvals and effective-dated delivery evidence.
          </span>
        </div>
        <div className="catalogue-boundary">
          <small>Institution boundary</small>
          <strong>{institutionId.slice(0, 12)}…</strong>
        </div>
      </header>

      <section className="catalogue-metrics">
        <article>
          <span>Approved curriculum</span>
          <strong>{metrics.approvedCurriculum}</strong>
          <small>Programmes and definitions</small>
        </article>
        <article>
          <span>Review queue</span>
          <strong>{metrics.reviewQueue}</strong>
          <small>Awaiting independent approval</small>
        </article>
        <article>
          <span>Active runs</span>
          <strong>{metrics.activeRuns}</strong>
          <small>Open or in progress</small>
        </article>
        <article>
          <span>Active enrolments</span>
          <strong>{metrics.activeEnrolments}</strong>
          <small>Current effective records</small>
        </article>
      </section>

      <nav className="catalogue-tabs" aria-label="Academic operations views">
        {(
          [
            ["curriculum", "Curriculum"],
            ["delivery", "Delivery"],
            ["enrolments", "Enrolments"],
          ] as const
        ).map(([key, title]) => (
          <button
            key={key}
            type="button"
            className={view === key ? "active" : ""}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {title}
          </button>
        ))}
      </nav>

      {view === "curriculum" ? (
        <CurriculumView
          institutionId={institutionId}
          workspace={workspace}
          roles={roles}
        />
      ) : view === "delivery" ? (
        <DeliveryView
          institutionId={institutionId}
          workspace={workspace}
          references={references}
          canManage={canDeliveryManage}
        />
      ) : (
        <EnrolmentView
          institutionId={institutionId}
          workspace={workspace}
          references={references}
          canManage={canDeliveryManage}
        />
      )}

      <style jsx global>{`
        .curriculum-records article {
          grid-template-columns: 58px minmax(190px, 1fr) minmax(230px, auto) auto;
        }
        .curriculum-records .curriculum-lifecycle {
          grid-column: 1 / -1;
          border-top: 1px solid var(--line);
          padding-top: 13px;
        }
        .curriculum-lifecycle-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .curriculum-lifecycle-actions button,
        .curriculum-approval-form summary,
        .curriculum-approval-form button {
          border: 1px solid var(--line-strong);
          border-radius: 9px;
          background: white;
          padding: 8px 11px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .curriculum-approval-form {
          margin-top: 10px;
        }
        .curriculum-approval-form summary {
          display: inline-flex;
          list-style: none;
        }
        .curriculum-approval-form summary::-webkit-details-marker {
          display: none;
        }
        .curriculum-approval-form form {
          display: grid;
          grid-template-columns: 180px 180px minmax(220px, 1fr) auto;
          gap: 10px;
          align-items: end;
          margin-top: 10px;
          padding: 12px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--canvas);
        }
        .curriculum-approval-form label {
          display: grid;
          gap: 5px;
          font-size: 10px;
          font-weight: 750;
        }
        .curriculum-approval-form input,
        .curriculum-approval-form textarea {
          width: 100%;
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          background: white;
          padding: 8px;
        }
        .curriculum-approval-form textarea {
          min-height: 58px;
          resize: vertical;
        }
        .curriculum-review-drawer {
          display: grid;
          gap: 12px;
          margin-top: 12px;
          border: 1px solid var(--line);
          border-radius: 13px;
          background: white;
          padding: 14px;
        }
        .curriculum-review-drawer > header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }
        .curriculum-review-drawer header small,
        .curriculum-review-drawer header strong {
          display: block;
        }
        .curriculum-review-drawer header small {
          color: var(--blue);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .12em;
        }
        .curriculum-review-drawer header strong {
          margin-top: 4px;
        }
        .curriculum-review-drawer header > span {
          align-self: start;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 9px;
          font-weight: 850;
        }
        .curriculum-review-drawer .passed {
          background: color-mix(in srgb, var(--success) 14%, white);
          color: var(--success);
        }
        .curriculum-review-drawer .blocked {
          background: color-mix(in srgb, var(--critical) 12%, white);
          color: var(--critical);
        }
        .curriculum-review-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .curriculum-review-metrics article {
          display: block;
          padding: 10px;
          border: 0;
          border-radius: 9px;
          background: var(--canvas);
        }
        .curriculum-review-metrics span,
        .curriculum-review-metrics strong,
        .curriculum-review-metrics code {
          display: block;
        }
        .curriculum-review-metrics span {
          color: var(--muted);
          font-size: 9px;
          text-transform: uppercase;
        }
        .curriculum-review-metrics strong,
        .curriculum-review-metrics code {
          margin-top: 5px;
        }
        .curriculum-review-findings {
          display: grid;
          gap: 7px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .curriculum-review-findings li {
          display: grid;
          grid-template-columns: 60px 1fr;
          gap: 10px;
          padding: 10px;
          border: 1px solid var(--line);
          border-radius: 9px;
        }
        .curriculum-review-findings li > b {
          color: var(--critical);
          font-size: 9px;
          text-transform: uppercase;
        }
        .curriculum-review-findings strong,
        .curriculum-review-findings small {
          display: block;
        }
        .curriculum-review-findings small {
          margin-top: 4px;
          color: var(--muted);
        }
        .curriculum-review-json summary,
        .curriculum-history summary {
          cursor: pointer;
          color: var(--blue);
          font-size: 11px;
          font-weight: 800;
        }
        .curriculum-review-json pre {
          overflow: auto;
          max-height: 320px;
          margin: 10px 0 0;
          border-radius: 9px;
          background: var(--ink);
          color: white;
          padding: 12px;
          font-size: 10px;
          line-height: 1.5;
        }
        .curriculum-history > div {
          display: grid;
          gap: 7px;
          margin-top: 10px;
        }
        .curriculum-history article {
          display: grid;
          grid-template-columns: 1fr 160px 180px;
          gap: 12px;
          padding: 9px;
          border: 1px solid var(--line);
          border-radius: 9px;
        }
        .catalogue-form-note {
          margin: 0;
          color: var(--muted);
          line-height: 1.55;
        }
        .catalogue-check {
          display: flex !important;
          align-items: center;
          gap: 8px !important;
        }
        .catalogue-check input {
          width: auto;
        }
        @media (max-width: 900px) {
          .curriculum-approval-form form {
            grid-template-columns: 1fr 1fr;
          }
          .curriculum-history article {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .curriculum-records article {
            grid-template-columns: 48px 1fr;
          }
          .curriculum-review-metrics,
          .curriculum-approval-form form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
