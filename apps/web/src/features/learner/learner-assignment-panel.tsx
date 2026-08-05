"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { LearnerAssignmentWorkspace } from "../../server/academic-evidence-api";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

async function academic(operation: string, input: Record<string, unknown>) {
  const response = await fetch(`/api/academic/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Assignment operation failed");
  return body;
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadChunks(
  file: File,
  objectKey: string,
  uploadSessionId: string,
  onOffset: (offset: number) => Promise<void>,
) {
  const chunkSize = 4 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
    const response = await fetch("/api/submission-upload", {
      method: "PATCH",
      headers: {
        "content-type": "application/octet-stream",
        "x-upload-session-id": uploadSessionId,
        "x-object-key": objectKey,
        "x-upload-offset": String(offset),
        "x-upload-total": String(file.size),
      },
      body: chunk,
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "File upload failed");
    const nextOffset = Number(body.uploadOffset);
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) throw new Error("Upload service returned an invalid offset");
    offset = nextOffset;
    await onOffset(offset);
  }
}

function formatDate(value?: string): string {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

export function LearnerAssignmentPanel({
  enrolmentId,
  courseRunId,
  workspace,
  gradebook,
}: {
  enrolmentId: string;
  courseRunId: string;
  workspace: LearnerAssignmentWorkspace;
  gradebook: Readonly<Record<string, unknown>>;
}) {
  const router = useRouter();
  const assignments = useMemo(
    () => workspace.assignments.filter((assignment) => value(assignment, "enrolmentId") === enrolmentId),
    [workspace.assignments, enrolmentId],
  );
  const gradeRows = Array.isArray(gradebook.results)
    ? (gradebook.results as Readonly<Record<string, unknown>>[])
    : [];
  const [selectedId, setSelectedId] = useState(assignments[0] ? value(assignments[0], "id") : "");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const selected = assignments.find((assignment) => value(assignment, "id") === selectedId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const file = data.get("file") instanceof File && (data.get("file") as File).size > 0
      ? (data.get("file") as File)
      : undefined;
    const text = String(data.get("text") ?? "").trim();
    if (!file && !text) {
      setMessage("Add submission text or a permitted file.");
      return;
    }
    setWorking(true);
    setMessage("Creating an immutable attempt...");
    try {
      const start = await academic("submission-start", {
        assignmentId: value(selected, "id"),
        enrolmentId,
        assignmentGroupId: value(selected, "assignmentGroupId") || undefined,
        supersedesAttemptId:
          ["submitted", "accepted", "withdrawn"].includes(value(selected, "latestAttemptStatus"))
            ? value(selected, "latestAttemptId") || undefined
            : undefined,
      });
      const attemptId = String(start.id);
      if (file) {
        const fileChecksum = await checksum(file);
        const uploadSessionId = crypto.randomUUID();
        const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_");
        const objectKey = `submissions/${courseRunId}/${attemptId}/${crypto.randomUUID()}-${safeName}`;
        const registered = await academic("submission-file", {
          attemptId,
          fileName: file.name,
          objectKey,
          mediaType: file.type || "application/octet-stream",
          byteSize: file.size,
          checksum: fileChecksum,
          uploadSessionId,
          uploadOffset: 0,
        });
        const fileId = String(registered.id);
        setMessage(`Uploading ${file.name}...`);
        await uploadChunks(file, objectKey, uploadSessionId, async (uploadOffset) => {
          setMessage(`Uploaded ${Math.round((uploadOffset / file.size) * 100)}%`);
          await academic("submission-offset", { fileId, uploadSessionId, uploadOffset });
        });
        setMessage("Upload complete. The attempt will remain open until malware scanning is clean.");
      } else {
        const receipt = await academic("submission-finalize", {
          attemptId,
          contentSnapshot: {
            schemaVersion: 1,
            format: "structured-text",
            text,
            submittedFrom: "learner-course-room",
          },
        });
        setMessage(`Submitted. Receipt ${String(receipt.receiptNumber)}`);
      }
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="vz-learner-assessment" aria-labelledby="learner-assessment-title">
      <header>
        <div><p>ASSIGNMENTS</p><h2 id="learner-assessment-title">Submission evidence</h2><span>Attempts, reconnect-safe uploads, receipts and released feedback remain versioned.</span></div>
        <strong>{assignments.length}</strong>
      </header>
      <div className="vz-learner-assignment-grid">
        <nav aria-label="Course assignments">
          {assignments.map((assignment) => (
            <button
              type="button"
              key={value(assignment, "id")}
              className={selectedId === value(assignment, "id") ? "active" : ""}
              onClick={() => setSelectedId(value(assignment, "id"))}
            >
              <span>{value(assignment, "latestAttemptStatus") || "Not started"}</span>
              <strong>{value(assignment, "title")}</strong>
              <small>{formatDate(value(assignment, "dueAt"))}</small>
            </button>
          ))}
          {!assignments.length ? <div className="vz-empty-state"><strong>No published assignments</strong><p>Due work appears here when the course team publishes it.</p></div> : null}
        </nav>

        <main>
          {selected ? (
            <>
              <header>
                <div><small>{value(selected, "courseTitle")}</small><h3>{value(selected, "title")}</h3></div>
                <span>{value(selected, "attemptCount")} of {value(selected, "maxAttempts")} attempts</span>
              </header>
              <div className="vz-assignment-instructions">
                <pre>{JSON.stringify(selected.instructions ?? {}, null, 2)}</pre>
              </div>
              {value(selected, "assignmentGroupName") ? <p className="vz-assignment-group">Group: <strong>{value(selected, "assignmentGroupName")}</strong></p> : null}
              {value(selected, "receiptNumber") ? (
                <section className="vz-receipt-card">
                  <small>IMMUTABLE ATTEMPT RECEIPT</small>
                  <strong>{value(selected, "receiptNumber")}</strong>
                  <code>{value(selected, "receiptChecksum")}</code>
                  <span>{formatDate(value(selected, "submittedAt"))}{value(selected, "isLate") === "true" ? " · Late" : ""}</span>
                </section>
              ) : null}
              {value(selected, "resultReleasedAt") ? (
                <section className="vz-released-feedback">
                  <small>RELEASED RESULT</small>
                  <strong>{value(selected, "releasedScore")}</strong>
                  <pre>{JSON.stringify(selected.releasedFeedback ?? {}, null, 2)}</pre>
                </section>
              ) : null}
              <form onSubmit={submit} className="vz-submission-form">
                <label>Submission text<textarea name="text" rows={8} placeholder="Write or paste your response" /></label>
                <label>Permitted file<input type="file" name="file" /></label>
                <p>Files upload in bounded chunks. A file attempt can only be finalised after malware scanning passes.</p>
                <button disabled={working}>{working ? "Working..." : "Create submission attempt"}</button>
                {message ? <span role="status">{message}</span> : null}
              </form>
            </>
          ) : null}
        </main>
      </div>

      <section className="vz-learner-gradebook" aria-labelledby="learner-gradebook-title">
        <header><div><p>GRADEBOOK</p><h2 id="learner-gradebook-title">Published results</h2></div><span>{gradeRows.length}</span></header>
        <div className="vz-evidence-table">
          <div className="head"><span>Item</span><span>Score</span><span>Maximum</span><span>State</span><span>Published</span><span>Weight</span></div>
          {gradeRows.map((row, index) => (
            <article key={value(row, "gradebookItemId") || String(index)}>
              <strong>{value(row, "title")}</strong>
              <span>{value(row, "overrideScore") || value(row, "score") || "Pending"}</span>
              <span>{value(row, "maximumScore")}</span>
              <span>{value(row, "isExempt") === "true" ? "Exempt" : value(row, "isExcluded") === "true" ? "Excluded" : value(row, "isMissing") === "true" ? "Missing" : "Published"}</span>
              <span>{value(row, "publishedAt") ? formatDate(value(row, "publishedAt")) : "Not published"}</span>
              <span>{value(row, "weight") || "Auto"}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
