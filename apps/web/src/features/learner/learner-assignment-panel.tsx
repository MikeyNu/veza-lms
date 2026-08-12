"use client";

import {
  Button,
  EmptyState,
  Field,
  FileUpload,
  Textarea,
} from "@veza/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { LearnerAssignmentWorkspace } from "../../server/academic-evidence-api";
import { postAcademicCommand, requestJsonRecord } from "./learner-client-request";
import styles from "./learner-assessment-workspace.module.css";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

function numberValue(row: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const current = row[key];
  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

function booleanValue(row: Readonly<Record<string, unknown>>, key: string): boolean {
  return row[key] === true;
}

function recordValue(row: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> | undefined {
  const current = row[key];
  return typeof current === "object" && current !== null && !Array.isArray(current)
    ? current as Readonly<Record<string, unknown>>
    : undefined;
}

function stringArray(row: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const current = row[key];
  return Array.isArray(current) ? current.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function safeDate(input: string): { readonly label: string; readonly dateTime?: string } {
  if (!input) return { label: "No due date" };
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return { label: "Date unavailable" };
  return {
    label: new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    }).format(date),
    dateTime: date.toISOString(),
  };
}

function humanize(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StructuredValue({ data }: { readonly data: unknown }): ReactNode {
  if (data === null || data === undefined || data === "") return <span className={styles.muted}>Not provided</span>;
  if (typeof data === "string" || typeof data === "number") return <span>{String(data)}</span>;
  if (typeof data === "boolean") return <span>{data ? "Yes" : "No"}</span>;
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className={styles.muted}>None</span>;
    return <ul className={styles.structuredList}>{data.map((item, index) => <li key={index}><StructuredValue data={item}/></li>)}</ul>;
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Readonly<Record<string, unknown>>);
    if (!entries.length) return <span className={styles.muted}>Not provided</span>;
    return <dl className={styles.structuredRecord}>{entries.map(([key, nested]) => <div key={key}><dt>{humanize(key)}</dt><dd><StructuredValue data={nested}/></dd></div>)}</dl>;
  }
  return <span className={styles.muted}>Not available</span>;
}

function responseId(record: Readonly<Record<string, unknown>>, label: string): string {
  const id = record.id;
  if (typeof id !== "string" || id.length === 0) throw new Error(`${label} response did not include an identifier.`);
  return id;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
    const body = await requestJsonRecord(
      "/api/submission-upload",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-session-id": uploadSessionId,
          "x-object-key": objectKey,
          "x-upload-offset": String(offset),
          "x-upload-total": String(file.size),
        },
        body: chunk,
      },
      "File upload failed.",
    );
    const nextOffset = body.uploadOffset;
    if (typeof nextOffset !== "number" || !Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw new Error("Upload service returned an invalid offset.");
    }
    offset = nextOffset;
    await onOffset(offset);
  }
}

function Gradebook({ gradebook }: { readonly gradebook: Readonly<Record<string, unknown>> }) {
  const rows = Array.isArray(gradebook.results)
    ? gradebook.results.filter((row): row is Readonly<Record<string, unknown>> => typeof row === "object" && row !== null && !Array.isArray(row))
    : [];
  return (
    <section className={styles.gradebook} aria-labelledby="learner-gradebook-title">
      <header>
        <div><p className={styles.context}>Published results</p><h2 id="learner-gradebook-title">Gradebook</h2><p>Only results published to this learner are shown.</p></div>
        <span>{rows.length} items</span>
      </header>
      {rows.length ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Item</th><th>Score</th><th>Maximum</th><th>State</th><th>Published</th><th>Weight</th></tr></thead>
            <tbody>{rows.map((row, index) => {
              const published = safeDate(value(row, "publishedAt"));
              const score = row.overrideScore ?? row.score;
              const state = booleanValue(row, "isExempt") ? "Exempt" : booleanValue(row, "isExcluded") ? "Excluded" : booleanValue(row, "isMissing") ? "Missing" : row.publishedAt ? "Published" : "Pending";
              return <tr key={value(row, "gradebookItemId") || String(index)}><th scope="row">{value(row, "title") || "Untitled item"}</th><td>{score === null || score === undefined ? "Pending" : String(score)}</td><td>{value(row, "maximumScore") || "Not set"}</td><td>{state}</td><td>{row.publishedAt ? <time {...(published.dateTime ? { dateTime: published.dateTime } : {})}>{published.label}</time> : "Not published"}</td><td>{value(row, "weight") || "Automatic"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      ) : <EmptyState compact title="No published results" description="Released grades will appear here after the course team publishes them." />}
    </section>
  );
}

export function LearnerAssignmentPanel({
  enrolmentId,
  courseRunId,
  workspace,
  gradebook,
}: {
  readonly enrolmentId: string;
  readonly courseRunId: string;
  readonly workspace: LearnerAssignmentWorkspace;
  readonly gradebook: Readonly<Record<string, unknown>>;
}) {
  const router = useRouter();
  const assignments = useMemo(() => workspace.assignments.filter((assignment) => value(assignment, "enrolmentId") === enrolmentId), [workspace.assignments, enrolmentId]);
  const [selectedId, setSelectedId] = useState(assignments[0] ? value(assignments[0], "id") : "");
  const [files, setFiles] = useState<readonly File[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const selected = assignments.find((assignment) => value(assignment, "id") === selectedId);
  const fileItems = files.map((file) => ({ id: fileKey(file), file, state: "selected" as const }));

  const selectAssignment = (id: string) => {
    setSelectedId(id);
    setFiles([]);
    setMessage(null);
    setFailure(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || working) return;
    const data = new FormData(event.currentTarget);
    const text = String(data.get("text") ?? "").trim();
    const file = files[0];
    if (!file && !text) {
      setFailure("Add submission text or one permitted file.");
      return;
    }
    if (file && text) {
      setFailure("Submit text or a file, not both. File attempts are finalised only after malware scanning, so text cannot be safely attached later.");
      return;
    }
    const attemptCount = numberValue(selected, "attemptCount") ?? 0;
    const maxAttempts = numberValue(selected, "maxAttempts") ?? 1;
    if (attemptCount >= maxAttempts) {
      setFailure(`This assignment allows ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}. No attempt remains.`);
      return;
    }

    setWorking(true);
    setFailure(null);
    setMessage("Creating submission attempt.");
    try {
      const start = await postAcademicCommand("submission-start", {
        assignmentId: value(selected, "id"),
        enrolmentId,
        ...(value(selected, "assignmentGroupId") ? { assignmentGroupId: value(selected, "assignmentGroupId") } : {}),
        ...(["submitted", "accepted", "withdrawn"].includes(value(selected, "latestAttemptStatus")) && value(selected, "latestAttemptId") ? { supersedesAttemptId: value(selected, "latestAttemptId") } : {}),
      });
      const attemptId = responseId(start, "Submission attempt");

      if (file) {
        const fileChecksum = await checksum(file);
        const uploadSessionId = crypto.randomUUID();
        const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_");
        const objectKey = `submissions/${courseRunId}/${attemptId}/${crypto.randomUUID()}-${safeName}`;
        const registered = await postAcademicCommand("submission-file", {
          attemptId,
          fileName: file.name,
          objectKey,
          mediaType: file.type || "application/octet-stream",
          byteSize: file.size,
          checksum: fileChecksum,
          uploadSessionId,
          uploadOffset: 0,
        });
        const fileId = responseId(registered, "Submission file");
        setMessage(`Uploading ${file.name}.`);
        await uploadChunks(file, objectKey, uploadSessionId, async (uploadOffset) => {
          setMessage(`Uploaded ${Math.round((uploadOffset / file.size) * 100)}%.`);
          await postAcademicCommand("submission-offset", { fileId, uploadSessionId, uploadOffset });
        });
        setMessage("Upload complete. Final submission becomes available after the file scan is clean.");
        setFiles([]);
      } else {
        const receipt = await postAcademicCommand("submission-finalize", {
          attemptId,
          contentSnapshot: { schemaVersion: 1, format: "structured-text", text, submittedFrom: "learner-course-room" },
        });
        const receiptNumber = typeof receipt.receiptNumber === "string" ? receipt.receiptNumber : "recorded";
        setMessage(`Submitted successfully. Receipt ${receiptNumber}.`);
        event.currentTarget.reset();
      }
      router.refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="learner-assessment-title">
      <header className={styles.workspaceHeader}>
        <div><p className={styles.context}>Course work</p><h2 id="learner-assessment-title">Assignments and submissions</h2><p>Published work, immutable attempt receipts and released feedback for this enrolment.</p></div>
        <span>{assignments.length} assignments</span>
      </header>

      {assignments.length ? (
        <div className={styles.assignmentGrid}>
          <nav className={styles.assignmentNav} aria-label="Course assignments">
            {assignments.map((assignment) => {
              const due = safeDate(value(assignment, "dueAt"));
              return <button type="button" key={value(assignment, "id")} className={selectedId === value(assignment, "id") ? styles.activeAssignment : undefined} aria-current={selectedId === value(assignment, "id") ? "page" : undefined} onClick={() => selectAssignment(value(assignment, "id"))}><span>{value(assignment, "latestAttemptStatus") || "Not started"}</span><strong>{value(assignment, "title")}</strong><time {...(due.dateTime ? { dateTime: due.dateTime } : {})}>{due.label}</time></button>;
            })}
          </nav>

          <div className={styles.assignmentDetail}>
            {selected ? <>
              <header><div><p className={styles.context}>{value(selected, "courseTitle")}</p><h3>{value(selected, "title")}</h3></div><span>{value(selected, "attemptCount") || "0"} of {value(selected, "maxAttempts") || "1"} attempts used</span></header>
              <section className={styles.instructions} aria-labelledby="assignment-instructions-title"><h4 id="assignment-instructions-title">Instructions</h4><StructuredValue data={recordValue(selected, "instructions") ?? selected.instructions}/></section>
              {value(selected, "assignmentGroupName") ? <p className={styles.groupLine}>Group submission: <strong>{value(selected, "assignmentGroupName")}</strong></p> : null}
              {value(selected, "receiptNumber") ? <dl className={styles.receipt}><div><dt>Receipt</dt><dd>{value(selected, "receiptNumber")}</dd></div><div><dt>Checksum</dt><dd><code>{value(selected, "receiptChecksum")}</code></dd></div><div><dt>Submitted</dt><dd>{safeDate(value(selected, "submittedAt")).label}{booleanValue(selected, "isLate") ? " · Late" : ""}</dd></div></dl> : null}
              {value(selected, "resultReleasedAt") ? <section className={styles.feedback}><div><p className={styles.context}>Released result</p><strong>{value(selected, "releasedScore") || "Recorded"}</strong></div><StructuredValue data={selected.releasedFeedback}/></section> : null}

              <form onSubmit={submit} className={styles.submissionForm}>
                <Field label="Submission text" description="Use text when the response can be submitted without an attachment."><Textarea name="text" rows={7} maxLength={100000} placeholder="Write or paste your response" disabled={working}/></Field>
                <FileUpload
                  label="Submission file"
                  description="Choose one file instead of submission text. Uploads are scanned before final submission."
                  items={fileItems}
                  onFilesSelected={(selectedFiles) => setFiles(selectedFiles.slice(0, 1))}
                  onRemove={(id) => setFiles((current) => current.filter((file) => fileKey(file) !== id))}
                  maximumFiles={1}
                  multiple={false}
                  disabled={working}
                  {...(stringArray(selected, "allowedFormats").length ? { accept: stringArray(selected, "allowedFormats").join(",") } : {})}
                />
                {failure ? <p className={styles.failure} role="alert">{failure}</p> : null}
                {message ? <p className={styles.status} role="status" aria-live="polite">{message}</p> : null}
                <Button type="submit" loading={working}>Create submission attempt</Button>
              </form>
            </> : null}
          </div>
        </div>
      ) : <EmptyState title="No published assignments" description="Due work appears here when the course team publishes it." />}

      <Gradebook gradebook={gradebook}/>
    </section>
  );
}