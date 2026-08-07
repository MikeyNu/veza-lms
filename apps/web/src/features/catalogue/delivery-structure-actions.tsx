"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";

async function createRecord(operation: "cohorts" | "classes", input: Readonly<Record<string, unknown>>) {
  const response = await fetch(`/api/catalogue/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Delivery structure operation failed");
}

function StructureForm({
  operation,
  institutionId,
  submitLabel,
  buildInput,
  children,
}: {
  operation: "cohorts" | "classes";
  institutionId: string;
  submitLabel: string;
  buildInput: (form: FormData) => Readonly<Record<string, unknown>>;
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
      await createRecord(operation, {
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
      {message ? <p className="catalogue-error" role="alert">{message}</p> : null}
      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function ActionPanel({ title, context, children }: { title: string; context: string; children: ReactNode }) {
  return (
    <details className="catalogue-action-panel">
      <summary>
        <span><small>{context}</small><strong>{title}</strong></span>
        <b aria-hidden="true">+</b>
      </summary>
      {children}
    </details>
  );
}

export function DeliveryStructureActions({
  institutionId,
  workspace,
  references,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
}) {
  const availableRuns = workspace.runs.filter((run) =>
    ["scheduled", "open", "in_progress"].includes(run.lifecycle),
  );

  return (
    <section className="catalogue-delivery-structure" aria-labelledby="delivery-structure-title">
      <header>
        <div>
          <p>DELIVERY STRUCTURE</p>
          <h2 id="delivery-structure-title">Cohorts and class sections</h2>
          <span>Group learners and define teaching sections before assigning effective enrolments.</span>
        </div>
        <dl>
          <div><dt>Cohorts</dt><dd>{references.cohorts.length}</dd></div>
          <div><dt>Classes</dt><dd>{references.classes.length}</dd></div>
        </dl>
      </header>

      <div className="catalogue-delivery-action-grid">
        <div className="catalogue-actions">
          <ActionPanel context="GROUPING" title="Create cohort">
            <StructureForm
              operation="cohorts"
              institutionId={institutionId}
              submitLabel="Create cohort"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                startsOn: form.get("startsOn") || undefined,
                endsOn: form.get("endsOn") || undefined,
              })}
            >
              <label>Code<input name="code" required maxLength={40} /></label>
              <label>Title<input name="title" required maxLength={160} /></label>
              <div className="catalogue-form-row">
                <label>Starts on<input name="startsOn" type="date" /></label>
                <label>Ends on<input name="endsOn" type="date" /></label>
              </div>
            </StructureForm>
          </ActionPanel>
        </div>

        <div className="catalogue-actions">
          <ActionPanel context="SECTION" title="Create class">
            <StructureForm
              operation="classes"
              institutionId={institutionId}
              submitLabel="Create class"
              buildInput={(form) => ({
                courseRunId: form.get("courseRunId"),
                cohortId: form.get("cohortId") || undefined,
                code: form.get("code"),
                title: form.get("title"),
                capacity: String(form.get("capacity") ?? "").trim() || undefined,
              })}
            >
              <label>
                Course run
                <select name="courseRunId" required defaultValue="">
                  <option value="" disabled>Select run</option>
                  {availableRuns.map((run) => <option key={run.id} value={run.id}>{run.code} · {run.title}</option>)}
                </select>
              </label>
              <label>
                Cohort
                <select name="cohortId" defaultValue="">
                  <option value="">No cohort</option>
                  {references.cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.code} · {cohort.title}</option>)}
                </select>
              </label>
              <label>Code<input name="code" required maxLength={40} /></label>
              <label>Title<input name="title" required maxLength={160} /></label>
              <label>Capacity<input name="capacity" type="number" min="1" max="100000" /></label>
            </StructureForm>
          </ActionPanel>
        </div>
      </div>
    </section>
  );
}
