"use client";

import { Button } from "@veza/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LearnerAssignmentWorkspace } from "../../server/academic-evidence-api";
import { postAcademicCommand } from "./learner-client-request";
import styles from "./learner-assessment-workspace.module.css";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

export function LearnerUploadFinalization({
  enrolmentId,
  workspace,
}: {
  readonly enrolmentId: string;
  readonly workspace: LearnerAssignmentWorkspace;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [pendingAttemptId, setPendingAttemptId] = useState<string | null>(null);
  const pending = workspace.assignments.filter((assignment) => value(assignment, "enrolmentId") === enrolmentId && value(assignment, "latestAttemptStatus") === "uploading" && value(assignment, "latestAttemptId"));
  if (!pending.length) return null;

  return (
    <section className={styles.finalization} aria-labelledby="uploaded-attempts-title">
      <header><div><p className={styles.context}>Uploaded attempts</p><h2 id="uploaded-attempts-title">Awaiting scan and final receipt</h2><p>Finalisation succeeds only after every uploaded file has a complete offset and clean malware evidence.</p></div><span>{pending.length} pending</span></header>
      <ul>
        {pending.map((assignment) => {
          const attemptId = value(assignment, "latestAttemptId");
          const working = pendingAttemptId === attemptId;
          return <li key={attemptId}><div><span>{value(assignment, "courseTitle")}</span><strong>{value(assignment, "title")}</strong><small>Attempt {value(assignment, "latestAttemptNumber")}</small></div><Button type="button" variant="secondary" size="small" loading={working} disabled={pendingAttemptId !== null && !working} onClick={async () => {
            if (pendingAttemptId) return;
            setPendingAttemptId(attemptId);
            setFailures((current) => ({ ...current, [attemptId]: "" }));
            setMessages((current) => ({ ...current, [attemptId]: "Checking scan evidence." }));
            try {
              const result = await postAcademicCommand("submission-finalize", { attemptId, contentSnapshot: { schemaVersion: 1, format: "file-submission", submittedFrom: "learner-course-room" } });
              const receipt = typeof result.receiptNumber === "string" ? result.receiptNumber : "recorded";
              setMessages((current) => ({ ...current, [attemptId]: `Submitted successfully. Receipt ${receipt}.` }));
              router.refresh();
            } catch (error) {
              setFailures((current) => ({ ...current, [attemptId]: error instanceof Error ? error.message : "Finalisation failed." }));
              setMessages((current) => ({ ...current, [attemptId]: "" }));
            } finally {
              setPendingAttemptId(null);
            }
          }}>Finalise scanned attempt</Button>{failures[attemptId] ? <p className={styles.failure} role="alert">{failures[attemptId]}</p> : messages[attemptId] ? <p className={styles.status} role="status" aria-live="polite">{messages[attemptId]}</p> : null}</li>;
        })}
      </ul>
    </section>
  );
}
