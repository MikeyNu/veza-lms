"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";
import { Button, Dialog, Select, Textarea, TextInput } from "@veza/ui";

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let result: { message?: string } = {};
  try {
    result = (await response.json()) as { message?: string };
  } catch {
    // Non-JSON failures still surface a bounded status message below.
  }
  if (!response.ok) {
    throw new Error(result.message ?? `Operation failed with status ${response.status}`);
  }
}

function useSubmission() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(work: () => Promise<void>, form?: HTMLFormElement): Promise<boolean> {
    setBusy(true);
    setMessage("");
    try {
      await work();
      form?.reset();
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, run };
}

function todayInJohannesburg(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ProgrammeComposition({
  institutionId,
  workspace,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
}) {
  const submission = useSubmission();
  const programmes = workspace.programmes.filter(
    (item) => item.lifecycle === "draft" || item.lifecycle === "in_review",
  );
  const blueprints = workspace.blueprints.filter(
    (item) => item.lifecycle === "approved",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const versionId = String(data.get("programmeVersionId"));
    const programme = programmes.find((item) => item.id === versionId);
    if (!programme) return;
    await submission.run(
      () =>
        post(`/api/catalogue/governance/programme-versions/${versionId}/courses`, {
          institutionId,
          blueprintVersionId: String(data.get("blueprintVersionId")),
          expectedProgrammeVersion: programme.version,
          sequenceNumber: Number(data.get("sequenceNumber")),
          requirementType: String(data.get("requirementType")),
          creditContribution: data.get("creditContribution")
            ? Number(data.get("creditContribution"))
            : undefined,
        }),
      form,
    );
  }

  return (
    <form className="governance-card" onSubmit={submit}>
      <header>
        <small>PROGRAMME COMPOSITION</small>
        <h3>Link an approved course</h3>
      </header>
      <label>
        Draft programme
        <Select name="programmeVersionId" required defaultValue="">
          <option value="">Select programme</option>
          {programmes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.title} · v{item.versionNumber}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Approved blueprint
        <Select name="blueprintVersionId" required defaultValue="">
          <option value="">Select blueprint</option>
          {blueprints.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.title}
            </option>
          ))}
        </Select>
      </label>
      <div className="catalogue-form-row">
        <label>
          Sequence
          <TextInput name="sequenceNumber" type="number" min="1" required />
        </label>
        <label>
          Requirement
          <Select name="requirementType" defaultValue="required">
            <option value="required">Required</option>
            <option value="elective">Elective</option>
            <option value="optional">Optional</option>
          </Select>
        </label>
      </div>
      <label>
        Credit contribution
        <TextInput name="creditContribution" type="number" min="0" step="0.5" />
      </label>
      {submission.message ? (
        <p className="catalogue-error" role="alert">
          {submission.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={submission.busy || !programmes.length || !blueprints.length}
        loading={submission.busy}
      >
        Link course
      </Button>
    </form>
  );
}

function RequisiteControl({
  institutionId,
  workspace,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
}) {
  const submission = useSubmission();
  const drafts = workspace.blueprints.filter(
    (item) => item.lifecycle === "draft" || item.lifecycle === "in_review",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const versionId = String(data.get("blueprintVersionId"));
    const blueprint = drafts.find((item) => item.id === versionId);
    if (!blueprint) return;
    await submission.run(
      () =>
        post(`/api/catalogue/governance/blueprint-versions/${versionId}/requisites`, {
          institutionId,
          requiredCourseDefinitionId: String(data.get("requiredCourseDefinitionId")),
          expectedBlueprintVersion: blueprint.version,
          requisiteType: String(data.get("requisiteType")),
          minimumResult: data.get("minimumResult")
            ? Number(data.get("minimumResult"))
            : undefined,
        }),
      form,
    );
  }

  return (
    <form className="governance-card" onSubmit={submit}>
      <header>
        <small>REQUISITE RULE</small>
        <h3>Add prerequisite or equivalency</h3>
      </header>
      <label>
        Draft blueprint
        <Select name="blueprintVersionId" required defaultValue="">
          <option value="">Select blueprint</option>
          {drafts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.title}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Required course
        <Select name="requiredCourseDefinitionId" required defaultValue="">
          <option value="">Select course</option>
          {workspace.blueprints.map((item) => (
            <option key={item.courseDefinitionId} value={item.courseDefinitionId}>
              {item.code} · {item.title}
            </option>
          ))}
        </Select>
      </label>
      <div className="catalogue-form-row">
        <label>
          Rule
          <Select name="requisiteType" defaultValue="prerequisite">
            <option value="prerequisite">Prerequisite</option>
            <option value="corequisite">Co-requisite</option>
            <option value="equivalent">Equivalent</option>
          </Select>
        </label>
        <label>
          Minimum result
          <TextInput name="minimumResult" type="number" min="0" max="100" step="0.01" />
        </label>
      </div>
      {submission.message ? (
        <p className="catalogue-error" role="alert">
          {submission.message}
        </p>
      ) : null}
      <Button type="submit" disabled={submission.busy || !drafts.length} loading={submission.busy}>
        Add rule
      </Button>
    </form>
  );
}

type RunTransition = Readonly<{
  runId: string;
  version: number;
  target: string;
  title: string;
}>;

function RunLifecycle({
  institutionId,
  workspace,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
}) {
  const submission = useSubmission();
  const [pending, setPending] = useState<RunTransition | null>(null);
  const [reason, setReason] = useState("");
  const next: Record<string, string | undefined> = {
    draft: "scheduled",
    scheduled: "open",
    open: "in_progress",
    in_progress: "completed",
  };

  function prepare(runId: string, version: number, lifecycle: string, title: string) {
    const target = next[lifecycle];
    if (!target) return;
    setReason("");
    setPending({ runId, version, target, title });
  }

  async function confirm() {
    if (!pending || reason.trim().length < 10) return;
    const succeeded = await submission.run(() =>
      post(`/api/catalogue/governance/runs/${pending.runId}/lifecycle`, {
        institutionId,
        expectedVersion: pending.version,
        lifecycle: pending.target,
        reason: reason.trim(),
      }),
    );
    if (succeeded) {
      setPending(null);
      setReason("");
    }
  }

  return (
    <section className="governance-card governance-list">
      <header>
        <small>RUN LIFECYCLE</small>
        <h3>Progress delivery deliberately</h3>
      </header>
      {workspace.runs
        .filter((run) => next[run.lifecycle])
        .map((run) => (
          <article key={run.id}>
            <div>
              <strong>{run.title}</strong>
              <small>
                {run.code} · {run.lifecycle.replaceAll("_", " ")}
              </small>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="small"
              disabled={submission.busy}
              onClick={() => prepare(run.id, run.version, run.lifecycle, run.title)}
            >
              Move to {next[run.lifecycle]?.replaceAll("_", " ")}
            </Button>
          </article>
        ))}
      {submission.message ? (
        <p className="catalogue-error" role="alert">
          {submission.message}
        </p>
      ) : null}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Confirm course run transition"
        description={
          pending
            ? `${pending.title} will move to ${pending.target.replaceAll("_", " ")}. Record the evidence for this governed change.`
            : undefined
        }
        size="small"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPending(null)} disabled={submission.busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={reason.trim().length < 10 || submission.busy}
              loading={submission.busy}
            >
              Confirm transition
            </Button>
          </>
        }
      >
        <label>
          Recorded reason
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            minLength={10}
            maxLength={1000}
            required
          />
        </label>
      </Dialog>
    </section>
  );
}

type EnrolmentTransition = Readonly<{
  enrolmentId: string;
  version: number;
  status: string;
  learnerName: string;
  courseRunTitle: string;
}>;

function EnrolmentLifecycle({
  institutionId,
  workspace,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
}) {
  const submission = useSubmission();
  const [pending, setPending] = useState<EnrolmentTransition | null>(null);
  const [reason, setReason] = useState("");
  const [completionResult, setCompletionResult] = useState("");
  const next: Record<string, readonly string[]> = {
    pending: ["active", "cancelled"],
    waitlisted: ["active", "cancelled"],
    active: ["completed", "withdrawn"],
  };

  function prepare(
    enrolmentId: string,
    version: number,
    status: string,
    learnerName: string,
    courseRunTitle: string,
  ) {
    setReason("");
    setCompletionResult("");
    setPending({ enrolmentId, version, status, learnerName, courseRunTitle });
  }

  async function confirm() {
    if (!pending || reason.trim().length < 10) return;
    const numericResult = pending.status === "completed" ? Number(completionResult) : undefined;
    if (
      pending.status === "completed" &&
      (!Number.isFinite(numericResult) || numericResult === undefined || numericResult < 0 || numericResult > 100)
    ) {
      return;
    }
    const succeeded = await submission.run(() =>
      post(`/api/catalogue/governance/enrolments/${pending.enrolmentId}/status`, {
        institutionId,
        expectedVersion: pending.version,
        status: pending.status,
        reason: reason.trim(),
        completionResult: numericResult,
      }),
    );
    if (succeeded) {
      setPending(null);
      setReason("");
      setCompletionResult("");
    }
  }

  const resultValid =
    pending?.status !== "completed" ||
    (completionResult.trim() !== "" &&
      Number.isFinite(Number(completionResult)) &&
      Number(completionResult) >= 0 &&
      Number(completionResult) <= 100);

  return (
    <section className="governance-card governance-list">
      <header>
        <small>ENROLMENT LIFECYCLE</small>
        <h3>Close current memberships with evidence</h3>
      </header>
      {workspace.enrolments
        .filter((item) => next[item.status])
        .slice(0, 12)
        .map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.learnerDisplayName}</strong>
              <small>
                {item.courseRunTitle} · {item.status}
              </small>
            </div>
            <div className="governance-actions">
              {(next[item.status] ?? []).map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant="secondary"
                  size="small"
                  disabled={submission.busy}
                  onClick={() =>
                    prepare(
                      item.id,
                      item.version,
                      status,
                      item.learnerDisplayName,
                      item.courseRunTitle,
                    )
                  }
                >
                  {status.replaceAll("_", " ")}
                </Button>
              ))}
            </div>
          </article>
        ))}
      {submission.message ? (
        <p className="catalogue-error" role="alert">
          {submission.message}
        </p>
      ) : null}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Confirm enrolment transition"
        description={
          pending
            ? `${pending.learnerName} in ${pending.courseRunTitle} will move to ${pending.status.replaceAll("_", " ")}. Record the evidence for this governed change.`
            : undefined
        }
        size="small"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPending(null)} disabled={submission.busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={reason.trim().length < 10 || !resultValid || submission.busy}
              loading={submission.busy}
            >
              Confirm transition
            </Button>
          </>
        }
      >
        <div className="vz-field-list">
          <label>
            Recorded reason
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              minLength={10}
              maxLength={1000}
              required
            />
          </label>
          {pending?.status === "completed" ? (
            <label>
              Final result percentage
              <TextInput
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={completionResult}
                onChange={(event) => setCompletionResult(event.currentTarget.value)}
                required
              />
            </label>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}

function TransferControl({
  institutionId,
  workspace,
  references,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
}) {
  const submission = useSubmission();
  const current = workspace.enrolments.filter((item) =>
    ["pending", "active", "waitlisted"].includes(item.status),
  );
  const targetRuns = workspace.runs.filter((run) =>
    ["scheduled", "open", "in_progress"].includes(run.lifecycle),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const enrolmentId = String(data.get("enrolmentId"));
    const enrolment = current.find((item) => item.id === enrolmentId);
    if (!enrolment) return;
    await submission.run(
      () =>
        post(`/api/catalogue/enrolments/${enrolmentId}/transfer`, {
          institutionId,
          expectedVersion: enrolment.version,
          targetCourseRunId: String(data.get("targetCourseRunId")),
          targetClassSectionId: String(data.get("targetClassSectionId") || "") || undefined,
          targetCohortId: String(data.get("targetCohortId") || "") || undefined,
          reason: String(data.get("reason")),
        }),
      form,
    );
  }

  return (
    <form className="governance-card" onSubmit={submit}>
      <header>
        <small>CONTROLLED TRANSFER</small>
        <h3>Move without losing history</h3>
      </header>
      <label>
        Current enrolment
        <Select name="enrolmentId" required defaultValue="">
          <option value="">Select membership</option>
          {current.map((item) => (
            <option key={item.id} value={item.id}>
              {item.learnerDisplayName} · {item.courseRunTitle}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Target run
        <Select name="targetCourseRunId" required defaultValue="">
          <option value="">Select target</option>
          {targetRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.code} · {run.title}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Target class
        <Select name="targetClassSectionId" defaultValue="">
          <option value="">Assign later</option>
          {references.classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.title}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Target cohort
        <Select name="targetCohortId" defaultValue="">
          <option value="">No cohort</option>
          {references.cohorts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.title}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Transfer reason
        <Textarea name="reason" required minLength={20} maxLength={1000} />
      </label>
      {submission.message ? (
        <p className="catalogue-error" role="alert">
          {submission.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={submission.busy || !current.length || !targetRuns.length}
        loading={submission.busy}
      >
        Transfer learner
      </Button>
    </form>
  );
}

function StaffAllocation({
  institutionId,
  references,
}: {
  institutionId: string;
  references: CatalogueReferences;
}) {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const classSectionId = String(data.get("classSectionId"));
    await submission.run(
      () =>
        post(`/api/catalogue/governance/classes/${classSectionId}/staff`, {
          institutionId,
          personId: String(data.get("personId")),
          allocationRole: String(data.get("allocationRole")),
          validFrom: String(data.get("validFrom")),
          validUntil: String(data.get("validUntil") || "") || undefined,
        }),
      form,
    );
  }

  return (
    <form className="governance-card" onSubmit={submit}>
      <header>
        <small>TEACHING ALLOCATION</small>
        <h3>Assign staff to a class</h3>
      </header>
      <label>
        Class section
        <Select name="classSectionId" required defaultValue="">
          <option value="">Select class</option>
          {references.classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.title}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Staff member
        <Select name="personId" required defaultValue="">
          <option value="">Select staff</option>
          {references.eligibleStaff.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName}
              {item.employeeNumber ? ` · ${item.employeeNumber}` : ""}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Allocation role
        <Select name="allocationRole" defaultValue="lead-instructor">
          <option value="lead-instructor">Lead instructor</option>
          <option value="instructor">Instructor</option>
          <option value="assistant">Assistant</option>
          <option value="assessor">Assessor</option>
        </Select>
      </label>
      <div className="catalogue-form-row">
        <label>
          Valid from
          <TextInput type="date" name="validFrom" required defaultValue={todayInJohannesburg()} />
        </label>
        <label>
          Valid until
          <TextInput type="date" name="validUntil" />
        </label>
      </div>
      {submission.message ? (
        <p className="catalogue-error" role="alert">
          {submission.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={submission.busy || !references.classes.length || !references.eligibleStaff.length}
        loading={submission.busy}
      >
        Assign staff
      </Button>
    </form>
  );
}

export function CatalogueGovernanceControls({
  institutionId,
  workspace,
  references,
  canManageCurriculum,
  canManageDelivery,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
  canManageCurriculum: boolean;
  canManageDelivery: boolean;
}) {
  if (!canManageCurriculum && !canManageDelivery) return null;

  return (
    <section className="catalogue-governance">
      <header>
        <div>
          <p>GOVERNED OPERATIONS</p>
          <h2>Composition, progression and historical integrity</h2>
        </div>
        <span>Every consequential change is version-checked and audited.</span>
      </header>
      <div className="governance-grid">
        {canManageCurriculum ? (
          <>
            <ProgrammeComposition institutionId={institutionId} workspace={workspace} />
            <RequisiteControl institutionId={institutionId} workspace={workspace} />
          </>
        ) : null}
        {canManageDelivery ? (
          <>
            <RunLifecycle institutionId={institutionId} workspace={workspace} />
            <EnrolmentLifecycle institutionId={institutionId} workspace={workspace} />
            <TransferControl
              institutionId={institutionId}
              workspace={workspace}
              references={references}
            />
            <StaffAllocation institutionId={institutionId} references={references} />
          </>
        ) : null}
      </div>
    </section>
  );
}
