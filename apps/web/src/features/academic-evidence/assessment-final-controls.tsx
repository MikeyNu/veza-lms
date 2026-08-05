"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
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
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Academic operation failed");
  return body;
}

export function AssessmentFinalControls({
  institutionId,
  workspace,
  references,
  canRelease,
}: {
  institutionId: string;
  workspace: AcademicEvidenceWorkspace;
  references: CatalogueReferences;
  canRelease: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(
    workspace.assignmentGroups[0] ? value(workspace.assignmentGroups[0], "id") : "",
  );
  const [selectedAttemptId, setSelectedAttemptId] = useState(
    workspace.submissions[0] ? value(workspace.submissions[0], "id") : "",
  );
  const [allocationId, setAllocationId] = useState("");
  const [markId, setMarkId] = useState("");
  const [markVersion, setMarkVersion] = useState(1);
  const selectedGroup = workspace.assignmentGroups.find((group) => value(group, "id") === selectedGroupId);
  const currentMembers = useMemo(
    () => new Set(records(selectedGroup ?? {}, "members").filter((member) => !value(member, "leftAt")).map((member) => value(member, "learnerPersonId"))),
    [selectedGroup],
  );
  const markable = workspace.submissions.filter((submission) =>
    ["submitted", "accepted"].includes(value(submission, "status")),
  );

  async function updateMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("Updating group membership...");
    try {
      await mutate("assignment-group-members", {
        institutionId,
        groupId: selectedGroupId,
        addLearnerPersonIds: data.getAll("addLearnerPersonIds").map(String),
        removeLearnerPersonIds: data.getAll("removeLearnerPersonIds").map(String),
        reason: String(data.get("reason")),
      });
      setMessage("Group membership updated");
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Membership update failed");
    }
  }

  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("Allocating marker...");
    try {
      const result = await mutate("marker-allocate", {
        attemptId: selectedAttemptId,
        markerPersonId: String(data.get("markerPersonId")),
        allocationRole: String(data.get("allocationRole")),
      });
      setAllocationId(String(result.id));
      setMessage("Marker allocation recorded. Continue to marking below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Marker allocation failed");
    }
  }

  async function recordMark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("Recording feedback evidence...");
    try {
      const result = await mutate("mark-record", {
        attemptId: selectedAttemptId,
        markerAllocationId: allocationId,
        score: Number(data.get("score")),
        rubricScores: {
          overall: String(data.get("rubricSummary")),
        },
        feedback: {
          learner: String(data.get("feedback")),
          privateMarkerNotes: String(data.get("privateNotes") || "") || undefined,
        },
        status: String(data.get("status")),
      });
      setMarkId(String(result.id));
      setMarkVersion(1);
      setMessage("Mark and feedback recorded");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Marking failed");
    }
  }

  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("Releasing result...");
    try {
      const result = await mutate("mark-release", {
        markId,
        expectedVersion: markVersion,
        reason: String(data.get("reason")),
      });
      setMarkVersion(Number(result.version ?? markVersion + 1));
      setMessage("Result released to the learner gradebook");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Result release failed");
    }
  }

  return (
    <section className="vz-completion-workspace" aria-labelledby="assessment-final-controls-title">
      <header>
        <div>
          <p>OPERATIONAL CONTROLS</p>
          <h2 id="assessment-final-controls-title">Membership and guided marking</h2>
          <span>Internal allocation identifiers remain inside the workflow and are never copied manually.</span>
        </div>
        <strong>{message}</strong>
      </header>
      <div className="vz-completion-grid">
        <section className="vz-record-surface">
          <header><div><p>ASSIGNMENT GROUPS</p><h3>Effective membership history</h3></div><span>{workspace.assignmentGroups.length}</span></header>
          {workspace.assignmentGroups.map((group) => (
            <article key={value(group, "id")}>
              <div>
                <small>{value(group, "status")}</small>
                <strong>{value(group, "name")}</strong>
                <span>{value(group, "assignmentTitle")}</span>
              </div>
              <dl>
                <div><dt>Current members</dt><dd>{records(group, "members").filter((member) => !value(member, "leftAt")).length}</dd></div>
                <div><dt>Historical members</dt><dd>{records(group, "members").filter((member) => value(member, "leftAt")).length}</dd></div>
              </dl>
            </article>
          ))}
        </section>
        <aside className="vz-governance-rail">
          <details className="vz-action-panel" open>
            <summary>Change group membership<span>+</span></summary>
            <form className="vz-governance-form" onSubmit={updateMembers}>
              <label>Assignment group<select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} required><option value="">Select group</option>{workspace.assignmentGroups.map((group) => <option key={value(group,"id")} value={value(group,"id")}>{value(group,"name")} · {value(group,"assignmentTitle")}</option>)}</select></label>
              <label>Add learners<select name="addLearnerPersonIds" multiple size={6}>{references.eligibleLearners.filter((learner) => !currentMembers.has(learner.id)).map((learner) => <option key={learner.id} value={learner.id}>{learner.displayName}</option>)}</select></label>
              <label>Remove learners<select name="removeLearnerPersonIds" multiple size={6}>{records(selectedGroup ?? {}, "members").filter((member) => !value(member,"leftAt")).map((member) => <option key={value(member,"learnerPersonId")} value={value(member,"learnerPersonId")}>{value(member,"learnerName")}</option>)}</select></label>
              <label>Reason<textarea name="reason" required minLength={10} /></label>
              <button disabled={!selectedGroupId}>Apply effective-dated change</button>
            </form>
          </details>
        </aside>
      </div>

      <div className="vz-guided-marking">
        <nav aria-label="Submitted attempts">
          {markable.map((submission) => (
            <button
              type="button"
              key={value(submission, "id")}
              className={selectedAttemptId === value(submission, "id") ? "active" : ""}
              onClick={() => {
                setSelectedAttemptId(value(submission, "id"));
                setAllocationId("");
                setMarkId(value(submission, "markId"));
                setMarkVersion(Number(value(submission, "markVersion") || 1));
              }}
            >
              <span>{value(submission, "markStatus") || "Awaiting marker"}</span>
              <strong>{value(submission, "learnerName")}</strong>
              <small>{value(submission, "assignmentTitle")} · attempt {value(submission, "attemptNumber")}</small>
            </button>
          ))}
        </nav>
        <main>
          <form className="vz-governance-form" onSubmit={allocate}>
            <h3>1. Allocate marker</h3>
            <label>Marker<select name="markerPersonId" required>{references.eligibleStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</select></label>
            <label>Role<select name="allocationRole"><option value="primary">Primary marker</option><option value="second">Second marker</option><option value="moderator">Moderator</option></select></label>
            <button disabled={!selectedAttemptId}>Allocate</button>
          </form>
          <form className="vz-governance-form" onSubmit={recordMark}>
            <h3>2. Record score and feedback</h3>
            <label>Score<input type="number" name="score" min="0" step="0.01" required /></label>
            <label>Rubric summary<textarea name="rubricSummary" required /></label>
            <label>Learner feedback<textarea name="feedback" required minLength={3} /></label>
            <label>Private marker notes<textarea name="privateNotes" /></label>
            <label>State<select name="status"><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="moderated">Moderated</option></select></label>
            <button disabled={!allocationId}>Record mark</button>
          </form>
          {canRelease ? (
            <form className="vz-governance-form" onSubmit={release}>
              <h3>3. Release result</h3>
              <label>Release reason<textarea name="reason" required minLength={10} /></label>
              <button disabled={!markId}>Release to learner</button>
            </form>
          ) : null}
        </main>
      </div>
    </section>
  );
}
