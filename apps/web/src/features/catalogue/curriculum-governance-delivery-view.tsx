"use client";

import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";
import { Field, Select, StatusIndicator, TextInput } from "@veza/ui";
import {
  GovernedActionPanel,
  GovernedOperationForm,
} from "../../components/governed-operation";

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function formatDate(value?: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function lifecycleTone(value: string): "neutral" | "info" | "success" | "warning" {
  if (value === "completed") return "success";
  if (value === "open" || value === "in_progress") return "info";
  if (value === "scheduled") return "warning";
  return "neutral";
}

export function CurriculumGovernanceDeliveryView({
  institutionId,
  workspace,
  references,
  canManage,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
  canManage: boolean;
}) {
  const approvedBlueprints = workspace.blueprints.filter(
    (blueprint) => blueprint.lifecycle === "approved",
  );
  return (
    <div className="catalogue-view-grid">
      <section className="catalogue-main-surface catalogue-wide">
        <header>
          <div>
            <p>Delivery register</p>
            <h2>Course runs and classes</h2>
          </div>
          <span>{workspace.runs.length}</span>
        </header>
        <div className="run-table">
          <div className="run-head">
            <span>Run</span><span>Period</span><span>Mode</span><span>Capacity</span><span>Status</span>
          </div>
          {workspace.runs.map((run) => (
            <article key={run.id}>
              <div>
                <strong>{run.title}</strong>
                <small>{run.code} · {formatDate(run.startsOn)} to {formatDate(run.endsOn)}</small>
              </div>
              <span>
                {references.academicPeriods.find((period) => period.id === run.academicPeriodId)?.title ?? run.academicPeriodId}
              </span>
              <span>{label(run.deliveryMode)}</span>
              <span>{run.activeEnrolmentCount}/{run.capacity ?? "No limit"}</span>
              <StatusIndicator label={label(run.lifecycle)} tone={lifecycleTone(run.lifecycle)} />
            </article>
          ))}
        </div>
      </section>
      {canManage ? (
        <aside className="catalogue-actions" aria-label="Delivery actions">
          <GovernedActionPanel context="Delivery" title="Schedule course run">
            <GovernedOperationForm
              path="/api/catalogue/runs"
              institutionId={institutionId}
              submitLabel="Schedule run"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                academicPeriodId: form.get("academicPeriodId"),
                blueprintVersionId: form.get("blueprintVersionId"),
                code: form.get("code"),
                title: form.get("title"),
                deliveryMode: form.get("deliveryMode"),
                startsOn: form.get("startsOn"),
                endsOn: form.get("endsOn"),
                capacity: String(form.get("capacity") ?? "").trim() || undefined,
              })}
            >
              <Field label="Approved blueprint">
                <Select name="blueprintVersionId" required defaultValue="">
                  <option value="" disabled>Select blueprint</option>
                  {approvedBlueprints.map((blueprint) => (
                    <option key={blueprint.id} value={blueprint.id}>{blueprint.code} · {blueprint.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Published academic period">
                <Select name="academicPeriodId" required defaultValue="">
                  <option value="" disabled>Select period</option>
                  {references.academicPeriods.map((period) => (
                    <option key={period.id} value={period.id}>{period.code} · {period.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Code"><TextInput name="code" required maxLength={40} /></Field>
              <Field label="Title"><TextInput name="title" required maxLength={200} /></Field>
              <Field label="Delivery mode">
                <Select name="deliveryMode" defaultValue="in_person">
                  <option value="in_person">In person</option>
                  <option value="online">Online</option>
                  <option value="blended">Blended</option>
                  <option value="workplace">Workplace</option>
                </Select>
              </Field>
              <div className="catalogue-form-row">
                <Field label="Starts on"><TextInput name="startsOn" type="date" required /></Field>
                <Field label="Ends on"><TextInput name="endsOn" type="date" required /></Field>
              </div>
              <Field label="Capacity"><TextInput name="capacity" type="number" min="1" /></Field>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Grouping" title="Create cohort">
            <GovernedOperationForm
              path="/api/catalogue/cohorts"
              institutionId={institutionId}
              submitLabel="Create cohort"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                startsOn: form.get("startsOn") || undefined,
                endsOn: form.get("endsOn") || undefined,
              })}
            >
              <Field label="Cohort code"><TextInput name="code" required maxLength={40} /></Field>
              <Field label="Cohort title"><TextInput name="title" required maxLength={160} /></Field>
              <div className="catalogue-form-row">
                <Field label="Starts on"><TextInput name="startsOn" type="date" /></Field>
                <Field label="Ends on"><TextInput name="endsOn" type="date" /></Field>
              </div>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Section" title="Create class">
            <GovernedOperationForm
              path="/api/catalogue/classes"
              institutionId={institutionId}
              submitLabel="Create class"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                courseRunId: form.get("courseRunId"),
                cohortId: form.get("cohortId") || undefined,
                code: form.get("code"),
                title: form.get("title"),
                capacity: String(form.get("capacity") ?? "").trim() || undefined,
              })}
            >
              <Field label="Course run">
                <Select name="courseRunId" required defaultValue="">
                  <option value="" disabled>Select run</option>
                  {workspace.runs
                    .filter((run) => !["completed", "cancelled"].includes(run.lifecycle))
                    .map((run) => (
                      <option key={run.id} value={run.id}>{run.code} · {run.title}</option>
                    ))}
                </Select>
              </Field>
              <Field label="Cohort">
                <Select name="cohortId" defaultValue="">
                  <option value="">No cohort</option>
                  {references.cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>{cohort.code} · {cohort.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Class code"><TextInput name="code" required maxLength={40} /></Field>
              <Field label="Class title"><TextInput name="title" required maxLength={160} /></Field>
              <Field label="Capacity"><TextInput name="capacity" type="number" min="1" max="100000" /></Field>
            </GovernedOperationForm>
          </GovernedActionPanel>
        </aside>
      ) : null}
    </div>
  );
}
