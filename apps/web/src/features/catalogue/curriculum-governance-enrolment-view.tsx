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

function statusTone(value: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (value === "active" || value === "completed") return "success";
  if (value === "pending" || value === "waitlisted") return "warning";
  if (value === "cancelled" || value === "withdrawn") return "danger";
  return "neutral";
}

export function CurriculumGovernanceEnrolmentView({
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
  const availableRuns = workspace.runs.filter((run) =>
    ["scheduled", "open", "in_progress"].includes(run.lifecycle),
  );
  return (
    <div className="catalogue-view-grid">
      <section className="catalogue-main-surface catalogue-wide">
        <header>
          <div>
            <p>Effective-dated membership</p>
            <h2>Enrolment ledger</h2>
          </div>
          <span>{workspace.enrolments.length}</span>
        </header>
        <div className="enrolment-table">
          <div className="enrolment-head">
            <span>Learner</span><span>Course run</span><span>Enrolled</span><span>Status</span>
          </div>
          {workspace.enrolments.map((enrolment) => (
            <article key={enrolment.id}>
              <div>
                <strong>{enrolment.learnerDisplayName}</strong>
                <small>{enrolment.learnerPersonId.slice(0, 12)}...</small>
              </div>
              <div>
                <strong>{enrolment.courseRunTitle}</strong>
                <small>{enrolment.courseRunId.slice(0, 12)}...</small>
              </div>
              <span>{formatDate(enrolment.enrolledOn)}</span>
              <StatusIndicator label={label(enrolment.status)} tone={statusTone(enrolment.status)} />
            </article>
          ))}
        </div>
      </section>
      {canManage ? (
        <aside className="catalogue-actions" aria-label="Enrolment actions">
          <GovernedActionPanel context="Enrolment" title="Enrol eligible learner">
            <GovernedOperationForm
              path="/api/catalogue/enrolments"
              institutionId={institutionId}
              submitLabel="Create enrolment"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                learnerPersonId: form.get("learnerPersonId"),
                courseRunId: form.get("courseRunId"),
                classSectionId: form.get("classSectionId") || undefined,
                cohortId: form.get("cohortId") || undefined,
                enrolledOn: form.get("enrolledOn"),
                status: form.get("status"),
              })}
            >
              <Field label="Eligible learner">
                <Select name="learnerPersonId" required defaultValue="">
                  <option value="" disabled>Select learner</option>
                  {references.eligibleLearners.map((learner) => (
                    <option key={learner.id} value={learner.id}>
                      {learner.displayName} · {label(learner.learnerStatus)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Available course run">
                <Select name="courseRunId" required defaultValue="">
                  <option value="" disabled>Select run</option>
                  {availableRuns.map((run) => (
                    <option key={run.id} value={run.id}>{run.code} · {run.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Class section">
                <Select name="classSectionId" defaultValue="">
                  <option value="">No class assignment</option>
                  {references.classes.map((section) => (
                    <option key={section.id} value={section.id}>{section.code} · {section.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cohort">
                <Select name="cohortId" defaultValue="">
                  <option value="">No cohort assignment</option>
                  {references.cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>{cohort.code} · {cohort.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Enrolled on"><TextInput name="enrolledOn" type="date" required /></Field>
              <Field label="Initial state">
                <Select name="status" defaultValue="active">
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="waitlisted">Waitlisted</option>
                </Select>
              </Field>
            </GovernedOperationForm>
          </GovernedActionPanel>
        </aside>
      ) : null}
    </div>
  );
}
