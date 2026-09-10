"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";
import type { AcademicEvidenceWorkspace } from "../../server/academic-evidence-api";
import {
  GovernedActionPanel,
  useGovernedActionClose,
} from "../../components/governed-operation";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

function date(value?: string): string {
  if (!value) return "Not available";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Invalid timestamp";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    ...(value.includes("T") ? { timeStyle: "short" as const } : {}),
    timeZone: "Africa/Johannesburg",
  }).format(timestamp);
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

function GovernedExportRequest({
  institutionId,
  catalogue,
  references,
  onRequested,
}: {
  institutionId: string;
  catalogue: CatalogueWorkspace;
  references: CatalogueReferences;
  onRequested: (message: string) => void;
}) {
  const router = useRouter();
  const closeAction = useGovernedActionClose();
  const [state, setState] = useState<"idle" | "requesting" | "error">("idle");
  const [message, setMessage] = useState("");
  const [exportType, setExportType] = useState("gradebook");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setState("requesting");
    setMessage("");
    const data = new FormData(form);
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
      form.reset();
      setExportType("gradebook");
      setState("idle");
      onRequested("Export requested. Veza will verify the dataset, render the document and publish a checksum before download.");
      closeAction?.();
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Export request failed");
    }
  }

  return (
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
      {message ? <p role="alert">{message}</p> : null}
      <button disabled={state === "requesting"}>
        {state === "requesting" ? "Requesting..." : "Generate governed export"}
      </button>
    </form>
  );
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
  const [message, setMessage] = useState("");
  const pending = useMemo(
    () => workspace.exports.some((item) => ["requested", "processing"].includes(value(item, "status"))),
    [workspace.exports],
  );

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => router.refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [pending, router]);

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

      {message ? <p className="vz-workspace-feedback" role="status">{message}</p> : null}

      <section className="vz-two-column-register vz-two-column-register--actions-on-demand">
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
                  <div><dt>File</dt><dd>{status === "ready" ? <a href={`/api/academic-exports/${id}/download`}>Download {format.toUpperCase()}</a> : status === "failed" ? "Review failure evidence" : "Not ready"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>

        <aside className="vz-governance-rail vz-governance-rail--toolbar" aria-label="Governed export actions">
          <GovernedActionPanel context="Portable evidence" title="Request document">
            <GovernedExportRequest
              institutionId={institutionId}
              catalogue={catalogue}
              references={references}
              onRequested={setMessage}
            />
          </GovernedActionPanel>
          <div className="evidence-boundary evidence-boundary--inline">
            <strong>Document evidence</strong>
            <p>The download is enabled only after object persistence, SHA-256 verification and a worker-owned completion transition.</p>
          </div>
        </aside>
      </section>
    </section>
  );
}
