"use client";

import type { DuplicateCandidate, DuplicateCandidatePage } from "@veza/contracts";
import { Button, Dialog, StatusIndicator } from "@veza/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "../../components/icon";

function humanize(value: string): string {
  const cleaned = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Identity similarity";
}

function evidenceLabels(value: unknown): readonly string[] {
  if (typeof value === "string") return [humanize(value)];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => evidenceLabels(item));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      if (nested === null || nested === undefined || nested === false) return [];
      if (nested === true) return [humanize(key)];
      if (typeof nested === "string" || typeof nested === "number") {
        return [`${humanize(key)}: ${String(nested)}`];
      }
      return evidenceLabels(nested).map((item) => `${humanize(key)}: ${item}`);
    });
  }
  return [];
}

function candidateStatus(status: DuplicateCandidate["status"]): { label: string; tone: "neutral" | "information" | "success" | "warning" } {
  switch (status) {
    case "merge-approved":
      return { label: "Merge approved", tone: "warning" };
    case "confirmed-distinct":
      return { label: "Confirmed separate", tone: "success" };
    case "dismissed":
      return { label: "Dismissed", tone: "neutral" };
    default:
      return { label: "Needs review", tone: "information" };
  }
}

export function DuplicateReview({ page }: { page: DuplicateCandidatePage }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");
  const [mergeCandidate, setMergeCandidate] = useState<DuplicateCandidate>();

  async function decide(id: string, decision: "confirmed-duplicate" | "not-duplicate") {
    setBusy(id);
    setMessage("");
    const response = await fetch(`/api/people/duplicates/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: decision === "confirmed-duplicate"
          ? "Reviewed matching identity evidence and approved this pair for controlled merge."
          : "Reviewed identity evidence and confirmed these are separate institutional people.",
      }),
    });
    const body = await response.json() as { message?: string };
    if (!response.ok) {
      setMessage(body.message ?? "The duplicate decision could not be saved.");
      setBusy(undefined);
      return;
    }
    setBusy(undefined);
    router.refresh();
  }

  async function merge(candidate: DuplicateCandidate) {
    setBusy(candidate.id);
    setMessage("");
    const response = await fetch("/api/people/merges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourcePersonId: candidate.rightPerson.id,
        targetPersonId: candidate.leftPerson.id,
        sourceExpectedVersion: candidate.rightPerson.version,
        targetExpectedVersion: candidate.leftPerson.version,
        reason: "Reviewed duplicate evidence and selected the left record as the surviving canonical institutional person.",
      }),
    });
    const body = await response.json() as { message?: string };
    if (!response.ok) {
      setMessage(body.message ?? "The merge could not be completed.");
      setBusy(undefined);
      return;
    }
    setBusy(undefined);
    setMergeCandidate(undefined);
    router.refresh();
  }

  return (
    <div className="people-workspace duplicate-review-workspace">
      <header className="people-heading">
        <div>
          <p>IDENTITY RECONCILIATION</p>
          <h1>Duplicate review</h1>
          <span>Compare identity evidence before confirming separate people or approving a controlled merge.</span>
        </div>
        <Link className="people-primary people-primary--secondary" href="/people">
          <Icon name="chevron-left" size="small" />
          <span>Back to directory</span>
        </Link>
      </header>

      {message ? <p className="people-error duplicate-review-message" role="alert">{message}</p> : null}

      <section className="duplicate-review-list" aria-label="Duplicate candidates">
        {page.items.length ? page.items.map((candidate) => {
          const evidence = evidenceLabels(candidate.reasons);
          const status = candidateStatus(candidate.status);
          const approved = candidate.status === "merge-approved";
          return (
            <article className="duplicate-review-card" key={candidate.id}>
              <header className="duplicate-review-card__header">
                <div>
                  <span className="duplicate-review-score">{Math.round(candidate.matchScore * 100)}% match</span>
                  <StatusIndicator label={status.label} tone={status.tone} quiet />
                </div>
                <time dateTime={candidate.createdAt}>Flagged {new Date(candidate.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</time>
              </header>

              <div className="duplicate-review-comparison" aria-label="Candidate record comparison">
                <section>
                  <span className="duplicate-review-record-label">Proposed survivor</span>
                  <strong>{candidate.leftPerson.displayName}</strong>
                  <small>Record {candidate.leftPerson.id.slice(0, 8)}</small>
                  <Link href={`/people/${candidate.leftPerson.id}`}>Open record <Icon name="arrow" size="small" /></Link>
                </section>
                <div className="duplicate-review-compare-marker" aria-hidden="true"><Icon name="people" /></div>
                <section>
                  <span className="duplicate-review-record-label">Possible duplicate</span>
                  <strong>{candidate.rightPerson.displayName}</strong>
                  <small>Record {candidate.rightPerson.id.slice(0, 8)}</small>
                  <Link href={`/people/${candidate.rightPerson.id}`}>Open record <Icon name="arrow" size="small" /></Link>
                </section>
              </div>

              <section className="duplicate-review-evidence" aria-labelledby={`evidence-${candidate.id}`}>
                <div>
                  <h2 id={`evidence-${candidate.id}`}>Why these records were matched</h2>
                  <p>These signals support review. They do not by themselves prove that both records belong to the same person.</p>
                </div>
                {evidence.length ? (
                  <ul>{evidence.map((item, index) => <li key={`${candidate.id}-${index}`}><Icon name="check-circle" size="small" /><span>{item}</span></li>)}</ul>
                ) : <p className="duplicate-review-no-evidence">No structured matching explanation was supplied for this candidate.</p>}
              </section>

              <footer className="duplicate-review-actions">
                <div className="duplicate-review-actions__decision">
                  <Button
                    variant="secondary"
                    loading={busy === candidate.id}
                    disabled={candidate.status !== "open"}
                    onClick={() => decide(candidate.id, "not-duplicate")}
                  >
                    Keep separate
                  </Button>
                  <Button
                    loading={busy === candidate.id}
                    disabled={candidate.status !== "open"}
                    onClick={() => decide(candidate.id, "confirmed-duplicate")}
                  >
                    Approve merge
                  </Button>
                </div>
                <div className="duplicate-review-actions__merge">
                  <span>{approved ? "Approval recorded. Final merge requires a deliberate confirmation." : "Approve the candidate before the merge action becomes available."}</span>
                  <Button
                    variant="danger"
                    disabled={!approved || busy === candidate.id}
                    onClick={() => setMergeCandidate(candidate)}
                  >
                    Merge records
                  </Button>
                </div>
              </footer>
            </article>
          );
        }) : (
          <div className="people-empty duplicate-review-empty">
            <Icon name="check-circle" />
            <strong>No duplicate candidates need review</strong>
            <p>Strong identity similarities that require a human decision will appear here.</p>
          </div>
        )}
      </section>

      {page.page.nextCursor ? (
        <Link className="people-next duplicate-review-next" href={`/people/duplicates?cursor=${encodeURIComponent(page.page.nextCursor)}`}>
          View more candidates <Icon name="arrow" size="small" />
        </Link>
      ) : null}

      <Dialog
        open={Boolean(mergeCandidate)}
        onClose={() => setMergeCandidate(undefined)}
        title="Merge these person records?"
        description="The left record will survive as the canonical institutional person. This operation is audited and may require MFA according to policy."
        destructive
        footer={mergeCandidate ? (
          <>
            <Button variant="quiet" onClick={() => setMergeCandidate(undefined)}>Cancel</Button>
            <Button variant="danger" loading={busy === mergeCandidate.id} onClick={() => merge(mergeCandidate)}>Merge records</Button>
          </>
        ) : null}
      >
        {mergeCandidate ? (
          <div className="duplicate-merge-confirmation">
            <div><span>Surviving record</span><strong>{mergeCandidate.leftPerson.displayName}</strong></div>
            <Icon name="arrow" />
            <div><span>Record to merge</span><strong>{mergeCandidate.rightPerson.displayName}</strong></div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
