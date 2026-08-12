"use client";

import type { CatalogueReferences, CatalogueWorkspace } from "@veza/contracts";
import { Field, Select, TextInput } from "@veza/ui";
import {
  GovernedActionPanel,
  GovernedOperationForm,
} from "../../components/governed-operation";

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
          <p>Delivery structure</p>
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
              <Field label="Code"><TextInput name="code" required maxLength={40} /></Field>
              <Field label="Title"><TextInput name="title" required maxLength={160} /></Field>
              <div className="catalogue-form-row">
                <Field label="Starts on"><TextInput name="startsOn" type="date" /></Field>
                <Field label="Ends on"><TextInput name="endsOn" type="date" /></Field>
              </div>
            </GovernedOperationForm>
          </GovernedActionPanel>
        </div>

        <div className="catalogue-actions">
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
                  {availableRuns.map((run) => (
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
              <Field label="Code"><TextInput name="code" required maxLength={40} /></Field>
              <Field label="Title"><TextInput name="title" required maxLength={160} /></Field>
              <Field label="Capacity"><TextInput name="capacity" type="number" min="1" max="100000" /></Field>
            </GovernedOperationForm>
          </GovernedActionPanel>
        </div>
      </div>
    </section>
  );
}
