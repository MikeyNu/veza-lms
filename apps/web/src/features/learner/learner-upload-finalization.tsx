"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LearnerAssignmentWorkspace } from "../../server/academic-evidence-api";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

async function finalize(attemptId: string) {
  const response = await fetch("/api/academic/submission-finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      attemptId,
      contentSnapshot: {
        schemaVersion: 1,
        format: "file-submission",
        submittedFrom: "learner-course-room",
      },
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "Uploaded attempt could not be finalised",
    );
  }
  return body;
}

export function LearnerUploadFinalization({
  enrolmentId,
  workspace,
}: {
  enrolmentId: string;
  workspace: LearnerAssignmentWorkspace;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Record<string, string>>({});
  const pending = workspace.assignments.filter(
    (assignment) =>
      value(assignment, "enrolmentId") === enrolmentId &&
      value(assignment, "latestAttemptStatus") === "uploading" &&
      value(assignment, "latestAttemptId"),
  );
  if (!pending.length) return null;

  return (
    <section className="vz-upload-finalization" aria-labelledby="uploaded-attempts-title">
      <header>
        <div>
          <p>UPLOADED ATTEMPTS</p>
          <h2 id="uploaded-attempts-title">Awaiting scan and final receipt</h2>
          <span>
            Finalisation succeeds only after every uploaded file has clean malware evidence and a
            complete offset.
          </span>
        </div>
        <strong>{pending.length}</strong>
      </header>
      <div>
        {pending.map((assignment) => {
          const attemptId = value(assignment, "latestAttemptId");
          return (
            <article key={attemptId}>
              <div>
                <small>{value(assignment, "courseTitle")}</small>
                <strong>{value(assignment, "title")}</strong>
                <span>Attempt {value(assignment, "latestAttemptNumber")}</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setMessages((current) => ({ ...current, [attemptId]: "Checking scan evidence..." }));
                  try {
                    const result = await finalize(attemptId);
                    setMessages((current) => ({
                      ...current,
                      [attemptId]: `Submitted. Receipt ${String(result.receiptNumber)}`,
                    }));
                    router.refresh();
                  } catch (error) {
                    setMessages((current) => ({
                      ...current,
                      [attemptId]:
                        error instanceof Error ? error.message : "Finalisation failed",
                    }));
                  }
                }}
              >
                Finalise scanned attempt
              </button>
              {messages[attemptId] ? <p role="status">{messages[attemptId]}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
