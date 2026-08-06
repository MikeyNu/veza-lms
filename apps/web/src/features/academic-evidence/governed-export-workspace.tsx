"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";
import type { AcademicEvidenceWorkspace } from "../../server/academic-evidence-api";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

function date(value?: string): string {
  return value
    ? new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: value.includes("T") ? "short" : undefined,
        timeZone: "Africa/Johannesburg",
      }).format(new Date(value))
    : "Not available";
}

function statusLabel(status: string): string {
  return status.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function requestExport(input: Readonly<Record<string, unknown>>): Promise<void> {
  const response = await fetch("/api/academic/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Export request failed");
}

export function GovernedExportWorkspace({
  institutionId,
  workspace,
  catalogue,
  references,
}: {
  institutionId: string;
  workspace: AcademicEvidenceWorkspace;
  catalogue: CatalogueWorkspace;
  references: CatalogueReferences;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "requesting" | "error">("idle");
  const [message, setMessage] = useState("");
  const [exportType, setExportType] = useState("gradebook");
  const pending = useMemo(
    () => workspace.exports.some((item) => ["requested", "processing"].includes(value(item, "status"))),
    [workspace.exports],
  );

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => router.refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [pending, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("requesting");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const learnerPersonId = String(data.get("learnerPersonId") ?? "");
    const courseRunId = String(data.get("courseRunId") ?? "");
    const filters = {
      ...(learnerPersonId ? { learnerPersonId } : {}),
      ...(courseRunId ? { courseRunId } : {}),
    };
    try {
      await requestExport({
        institutionId,
        exportType: String(data.get("exportType")),
        format: String(data.get("format")),
        filters,
      });
      setMessage("Export requested. Veza will verify the dataset, render the document and publish a checksum before download.");
      setState("idle");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Export request failed");
    }
  }

  return (
    <section className="vz-learning-page vz-evidence-workspace" aria-labelledby="governed-exports-title">
      <header className="vz-page-heading">
        <div>
          <p>GOVERNED DOCUMENT EXPORTS</p>
          <h1 id="governed-exports-title">Portable evidence with verified delivery</h1>
          <span>Every file is generated asynchronously, checksummed, tenant scoped and automatically expired.</span>
        </div>
        <small>{workspace.exports.length} export jobs</small>
      </header>

      <section className="vz-two-column-register">
        <div className="vz-record-surface">
          <header>
            <div><p>EXPORT LEDGER</p><h2>Requested documents and datasets</h2></div>
            <span>{pending ? "Processing" : "Current"}</span>
          </header>
          {workspace.exports.length === 0 ? (
            <div className="section-state-panel">
              <strong>No exports have been requested</strong>
              <p>Choose the evidence type and file format. The worker will create an immutable receipt before a download becomes available.</p>
            </div>
          ) : workspace.exports.map((item) => {
            const id = value(item, "id");
            const status = value(item, "status");
            const format = value(item, "format");
            const expiresAt = value(item, "expiresAt");
            return (
              <article key={id}>
                <div>
                  <small>{format.toUpperCase()}</small>
                  <strong>{statusLabel(value(item, "exportType"))}</strong>
                  <span>Requested {date(value(item, "requestedAt"))}</span>
                </div>
                <dl>
                  <div><dt>Rows</dt><dd>{value(item, "rowCount") || "Pending"}</dd></div>
                  <div><dt>Status</dt><dd>{statusLabel(status)}</dd></div>
                  <div><dt>Expires</dt><dd>{expiresAt ? date(expiresAt) : "After generation"}</dd></div>
                  <div>
                    <dt>File</dt>
                    <dd>
                      {status === "ready" ? (
                        <a href={`/api/academic-exports/${id}/download`}>Download {format.toUpperCase()}</a>
                      ) : status === "failed" ? "Review failure evidence" : "Not ready"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>

        <aside className="vz-governance-rail" aria-label="Request a governed export">
          <details className="vz-action-panel" open>
            <summary>Request document<span aria-hidden="true">+</span></summary>
            <form className="vz-governance-form" onSubmit={submit}>
              <label>
                Evidence type
                <select name="exportType" value={exportType} onChange={(event) => setExportType(event.currentTarget.value)}>
                  <option value="transcript">Learner transcript</option>
                  <option value="gradebook">Gradebook</option>
                  <option value="enrolments">Enrolments</option>
                  <option value="people">People directory</option>
                  <option value="analytics">Analytics</option>
                </select>
              </label>
              <label>
                File format
                <select name="format" defaultValue="pdf">
                  <option value="pdf">PDF document</option>
                  <option value="csv">CSV dataset</option>
                  <option value="json">Structured JSON</option>
                </select>
              </label>
              {exportType === "transcript" ? (
                <label>
                  Learner
                  <select name="learnerPersonId" required>
                    <option value="">Select learner</option>
                    {references.eligibleLearners.map((learner) => (
                      <option key={learner.id} value={learner.id}>{learner.displayName}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {["gradebook", "enrolments", "analytics"].includes(exportType) ? (
                <label>
                  Course run
                  <select name="courseRunId">
                    <option value="">All permitted records</option>
                    {catalogue.runs.map((run) => <option key={run.id} value={run.id}>{run.title}</option>)}
                  </select>
                </label>
              ) : null}
              {message ? <p role={state === "error" ? "alert" : "status"}>{message}</p> : null}
              <button disabled={state === "requesting"}>
                {state === "requesting" ? "Requesting..." : "Generate governed export"}
              </button>
            </form>
          </details>
          <div className="evidence-boundary">
            <strong>Document evidence</strong>
            <p>The download is enabled only after object persistence, SHA-256 verification and a worker-owned completion transition.</p>
          </div>
        </aside>
      </section>
    </section>
  );
}
