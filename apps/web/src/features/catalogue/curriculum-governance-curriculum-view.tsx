"use client";

import type { BaselineRoleKey, CatalogueWorkspace } from "@veza/contracts";
import {
  Checkbox,
  Field,
  FieldGroup,
  Select,
  StatusIndicator,
  Textarea,
  TextInput,
} from "@veza/ui";
import {
  GovernedActionPanel,
  GovernedOperationForm,
} from "../../components/governed-operation";
import { CurriculumLifecycle } from "./curriculum-governance-lifecycle";

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function lifecycleTone(value: string): "neutral" | "info" | "success" | "warning" {
  if (value === "approved") return "success";
  if (value === "in_review") return "warning";
  if (value === "draft") return "info";
  return "neutral";
}

function requiredString(form: FormData, name: string): string {
  const value = String(form.get(name) ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function CurriculumGovernanceCurriculumView({
  institutionId,
  workspace,
  roles,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  roles: readonly BaselineRoleKey[];
}) {
  const canManage = roles.some((role) =>
    ["tenant-owner", "institution-admin", "curriculum-manager"].includes(role),
  );
  const canApprove = roles.some((role) =>
    ["tenant-owner", "institution-admin"].includes(role),
  );
  const approvedBlueprints = workspace.blueprints.filter(
    (blueprint) => blueprint.lifecycle === "approved",
  );
  const mutableProgrammes = workspace.programmes.filter(
    (programme) => programme.lifecycle === "draft" || programme.lifecycle === "in_review",
  );
  const parentDefinitions = workspace.blueprints.filter((blueprint) =>
    ["subject", "module", "course"].includes(blueprint.definitionType),
  );

  return (
    <div className="catalogue-view-grid curriculum-governance-grid">
      <section className="catalogue-main-surface">
        <header>
          <div>
            <p>Programme governance</p>
            <h2>Programme versions</h2>
          </div>
          <span>{workspace.programmes.length}</span>
        </header>
        {workspace.programmes.length ? (
          <div className="catalogue-record-list curriculum-records">
            {workspace.programmes.map((programme) => (
              <article key={programme.id}>
                <div className="catalogue-code">{programme.code}</div>
                <div>
                  <strong>{programme.title}</strong>
                  <small>{label(programme.programmeType)} · version {programme.versionNumber}</small>
                </div>
                <dl>
                  <div><dt>Credit</dt><dd>{programme.creditValue ?? "Not set"}</dd></div>
                  <div><dt>Hours</dt><dd>{programme.notionalHours ?? "Not set"}</dd></div>
                  <div><dt>Courses</dt><dd>{programme.courseCount}</dd></div>
                </dl>
                <StatusIndicator
                  label={label(programme.lifecycle)}
                  tone={lifecycleTone(programme.lifecycle)}
                />
                <CurriculumLifecycle
                  institutionId={institutionId}
                  kind="programmes"
                  item={programme}
                  canSubmit={canManage}
                  canApprove={canApprove}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="catalogue-empty">
            <strong>No programme versions</strong>
            <p>Create the institution programme before scheduling delivery.</p>
          </div>
        )}
      </section>

      <section className="catalogue-main-surface">
        <header>
          <div>
            <p>Curriculum definitions</p>
            <h2>Subjects, modules, courses and units</h2>
          </div>
          <span>{workspace.blueprints.length}</span>
        </header>
        {workspace.blueprints.length ? (
          <div className="catalogue-record-list curriculum-records">
            {workspace.blueprints.map((blueprint) => (
              <article key={blueprint.id}>
                <div className="catalogue-code">{blueprint.code}</div>
                <div>
                  <strong>{blueprint.title}</strong>
                  <small>
                    {label(blueprint.definitionType)} · version {blueprint.versionNumber}
                    {blueprint.parentDefinitionId ? " · nested definition" : ""}
                  </small>
                </div>
                <dl>
                  <div><dt>Outcomes</dt><dd>{blueprint.outcomeCount}</dd></div>
                  <div><dt>Requisites</dt><dd>{blueprint.requisiteCount}</dd></div>
                  <div><dt>Hours</dt><dd>{blueprint.notionalHours ?? "Not set"}</dd></div>
                </dl>
                <StatusIndicator
                  label={label(blueprint.lifecycle)}
                  tone={lifecycleTone(blueprint.lifecycle)}
                />
                <CurriculumLifecycle
                  institutionId={institutionId}
                  kind="blueprints"
                  item={blueprint}
                  canSubmit={canManage}
                  canApprove={canApprove}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="catalogue-empty">
            <strong>No curriculum definitions</strong>
            <p>Create outcomes first, then define a subject, module, course or unit.</p>
          </div>
        )}
      </section>

      <section className="catalogue-outcomes">
        <header>
          <div>
            <p>Outcome library</p>
            <h2>Institution learning outcomes and competencies</h2>
          </div>
          <span>{workspace.outcomes.length}</span>
        </header>
        <div>
          {workspace.outcomes.map((outcome) => (
            <article key={outcome.id}>
              <span>{outcome.code}</span>
              <strong>{outcome.title}</strong>
              <small>{label(outcome.outcomeType)}{outcome.levelCode ? ` · ${outcome.levelCode}` : ""}</small>
            </article>
          ))}
        </div>
      </section>

      {canManage ? (
        <aside className="catalogue-actions" aria-label="Curriculum actions">
          <GovernedActionPanel context="Outcome" title="Create learning outcome">
            <GovernedOperationForm
              path="/api/catalogue/outcomes"
              institutionId={institutionId}
              submitLabel="Create outcome"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                description: form.get("description"),
                outcomeType: form.get("outcomeType"),
                levelCode: form.get("levelCode") || undefined,
              })}
            >
              <Field label="Code"><TextInput name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,31}" required /></Field>
              <Field label="Title"><TextInput name="title" minLength={3} maxLength={180} required /></Field>
              <Field label="Description"><Textarea name="description" minLength={10} maxLength={4000} required /></Field>
              <Field label="Outcome type">
                <Select name="outcomeType" defaultValue="knowledge">
                  <option value="knowledge">Knowledge</option>
                  <option value="skill">Skill</option>
                  <option value="competency">Competency</option>
                  <option value="graduate-attribute">Graduate attribute</option>
                </Select>
              </Field>
              <Field label="Level code"><TextInput name="levelCode" maxLength={40} /></Field>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Programme" title="Create programme version">
            <GovernedOperationForm
              path="/api/catalogue/programmes"
              institutionId={institutionId}
              submitLabel="Create programme"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                description: form.get("description"),
                programmeType: form.get("programmeType"),
                creditValue: String(form.get("creditValue") ?? "").trim() || undefined,
                notionalHours: String(form.get("notionalHours") ?? "").trim() || undefined,
                durationValue: String(form.get("durationValue") ?? "").trim() || undefined,
                durationUnit: form.get("durationUnit") || undefined,
              })}
            >
              <Field label="Code"><TextInput name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,31}" required /></Field>
              <Field label="Title"><TextInput name="title" minLength={3} maxLength={200} required /></Field>
              <Field label="Description"><Textarea name="description" minLength={10} maxLength={8000} required /></Field>
              <Field label="Programme type">
                <Select name="programmeType" defaultValue="qualification">
                  <option value="qualification">Qualification</option>
                  <option value="learning-path">Learning path</option>
                  <option value="short-course">Short course</option>
                  <option value="grade-band">Grade band</option>
                </Select>
              </Field>
              <div className="catalogue-form-row">
                <Field label="Credit"><TextInput name="creditValue" type="number" min="0" step="0.5" /></Field>
                <Field label="Notional hours"><TextInput name="notionalHours" type="number" min="0" /></Field>
              </div>
              <div className="catalogue-form-row">
                <Field label="Duration"><TextInput name="durationValue" type="number" min="1" /></Field>
                <Field label="Duration unit">
                  <Select name="durationUnit" defaultValue="months">
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </Select>
                </Field>
              </div>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Definition" title="Create subject, module, course or unit">
            <GovernedOperationForm
              path="/api/catalogue/blueprints"
              institutionId={institutionId}
              submitLabel="Create curriculum definition"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                code: form.get("code"),
                title: form.get("title"),
                description: form.get("description"),
                definitionType: form.get("definitionType"),
                parentDefinitionId: form.get("parentDefinitionId") || undefined,
                subjectArea: form.get("subjectArea") || undefined,
                creditValue: String(form.get("creditValue") ?? "").trim() || undefined,
                notionalHours: String(form.get("notionalHours") ?? "").trim() || undefined,
                deliveryModes: form.getAll("deliveryModes"),
                outcomeIds: form.getAll("outcomeIds"),
              })}
            >
              <Field label="Definition type">
                <Select name="definitionType" defaultValue="course">
                  <option value="subject">Subject</option>
                  <option value="module">Module</option>
                  <option value="course">Course</option>
                  <option value="unit">Unit</option>
                </Select>
              </Field>
              <Field label="Parent definition">
                <Select name="parentDefinitionId" defaultValue="">
                  <option value="">No parent</option>
                  {parentDefinitions.map((definition) => (
                    <option key={definition.courseDefinitionId} value={definition.courseDefinitionId}>
                      {definition.code} · {definition.title} · {label(definition.definitionType)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Code"><TextInput name="code" pattern="[A-Z0-9][A-Z0-9._-]{1,31}" required /></Field>
              <Field label="Title"><TextInput name="title" minLength={3} maxLength={200} required /></Field>
              <Field label="Description"><Textarea name="description" minLength={10} maxLength={8000} required /></Field>
              <Field label="Subject area"><TextInput name="subjectArea" maxLength={120} /></Field>
              <div className="catalogue-form-row">
                <Field label="Credit"><TextInput name="creditValue" type="number" min="0" step="0.5" /></Field>
                <Field label="Notional hours"><TextInput name="notionalHours" type="number" min="0" /></Field>
              </div>
              <FieldGroup legend="Delivery modes">
                <Checkbox name="deliveryModes" value="in_person" defaultChecked label="In person" />
                <Checkbox name="deliveryModes" value="online" label="Online" />
                <Checkbox name="deliveryModes" value="blended" label="Blended" />
                <Checkbox name="deliveryModes" value="workplace" label="Workplace" />
              </FieldGroup>
              <Field label="Mapped outcomes">
                <Select name="outcomeIds" multiple required>
                  {workspace.outcomes.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.title}</option>
                  ))}
                </Select>
              </Field>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Programme" title="Set required programme outcome">
            <GovernedOperationForm
              path={(form) => `/api/catalogue/curriculum/programmes/${encodeURIComponent(requiredString(form, "programmeVersionId"))}/outcome-requirements`}
              institutionId={institutionId}
              submitLabel="Set outcome requirement"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => {
                const programmeVersionId = requiredString(form, "programmeVersionId");
                const programme = mutableProgrammes.find((item) => item.id === programmeVersionId);
                if (!programme) throw new Error("Select a mutable programme version");
                return {
                  expectedProgrammeVersion: programme.version,
                  learningOutcomeId: requiredString(form, "learningOutcomeId"),
                  minimumCoverageLevel: requiredString(form, "minimumCoverageLevel"),
                };
              }}
            >
              <Field label="Programme version">
                <Select name="programmeVersionId" required defaultValue="">
                  <option value="" disabled>Select programme</option>
                  {mutableProgrammes.map((programme) => (
                    <option key={programme.id} value={programme.id}>
                      {programme.code} · {programme.title} · v{programme.versionNumber}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Learning outcome">
                <Select name="learningOutcomeId" required defaultValue="">
                  <option value="" disabled>Select outcome</option>
                  {workspace.outcomes.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Minimum coverage">
                <Select name="minimumCoverageLevel" defaultValue="developed">
                  <option value="introduced">Introduced</option>
                  <option value="developed">Developed</option>
                  <option value="mastered">Mastered</option>
                  <option value="assessed">Assessed</option>
                </Select>
              </Field>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Composition" title="Add approved course to programme">
            <GovernedOperationForm
              path={(form) => `/api/catalogue/governance/programme-versions/${encodeURIComponent(requiredString(form, "programmeVersionId"))}/courses`}
              institutionId={institutionId}
              submitLabel="Add course"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => {
                const programmeVersionId = requiredString(form, "programmeVersionId");
                const programme = mutableProgrammes.find((item) => item.id === programmeVersionId);
                if (!programme) throw new Error("Select a mutable programme version");
                return {
                  blueprintVersionId: requiredString(form, "blueprintVersionId"),
                  sequenceNumber: Number(form.get("sequenceNumber")),
                  requirementType: form.get("requirementType"),
                  creditContribution: String(form.get("creditContribution") ?? "").trim() || undefined,
                  expectedProgrammeVersion: programme.version,
                };
              }}
            >
              <Field label="Draft or in-review programme">
                <Select name="programmeVersionId" required defaultValue="">
                  <option value="" disabled>Select programme</option>
                  {mutableProgrammes.map((programme) => (
                    <option key={programme.id} value={programme.id}>{programme.code} · {programme.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Approved blueprint">
                <Select name="blueprintVersionId" required defaultValue="">
                  <option value="" disabled>Select course blueprint</option>
                  {approvedBlueprints.map((blueprint) => (
                    <option key={blueprint.id} value={blueprint.id}>{blueprint.code} · {blueprint.title}</option>
                  ))}
                </Select>
              </Field>
              <div className="catalogue-form-row">
                <Field label="Sequence"><TextInput name="sequenceNumber" type="number" min="1" required /></Field>
                <Field label="Requirement">
                  <Select name="requirementType" defaultValue="required">
                    <option value="required">Required</option>
                    <option value="elective">Elective</option>
                    <option value="optional">Optional</option>
                  </Select>
                </Field>
              </div>
              <Field label="Credit contribution"><TextInput name="creditContribution" type="number" min="0" step="0.5" /></Field>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Validation" title="Create curriculum validation policy">
            <GovernedOperationForm
              path="/api/catalogue/curriculum/validation-policies"
              institutionId={institutionId}
              submitLabel="Create draft policy"
              className="catalogue-form vz-field-list"
              errorClassName="catalogue-error"
              buildInput={(form) => ({
                creditRequired: form.get("creditRequired") === "on",
                notionalHoursRequired: form.get("notionalHoursRequired") === "on",
                durationRequired: form.get("durationRequired") === "on",
                hoursPerCredit: String(form.get("hoursPerCredit") ?? "").trim() || undefined,
                ratioTolerancePercent: Number(form.get("ratioTolerancePercent") ?? 10),
                minimumCredit: String(form.get("minimumCredit") ?? "").trim() || undefined,
                maximumCredit: String(form.get("maximumCredit") ?? "").trim() || undefined,
                minimumNotionalHours: String(form.get("minimumNotionalHours") ?? "").trim() || undefined,
                maximumNotionalHours: String(form.get("maximumNotionalHours") ?? "").trim() || undefined,
              })}
            >
              <Checkbox name="creditRequired" label="Credit required" />
              <Checkbox name="notionalHoursRequired" defaultChecked label="Notional hours required" />
              <Checkbox name="durationRequired" label="Programme duration required" />
              <div className="catalogue-form-row">
                <Field label="Hours per credit"><TextInput name="hoursPerCredit" type="number" min="0.01" step="0.01" /></Field>
                <Field label="Ratio tolerance %"><TextInput name="ratioTolerancePercent" type="number" min="0" max="100" defaultValue="10" /></Field>
              </div>
              <div className="catalogue-form-row">
                <Field label="Minimum credit"><TextInput name="minimumCredit" type="number" min="0" step="0.5" /></Field>
                <Field label="Maximum credit"><TextInput name="maximumCredit" type="number" min="0.01" step="0.5" /></Field>
              </div>
              <div className="catalogue-form-row">
                <Field label="Minimum hours"><TextInput name="minimumNotionalHours" type="number" min="0" /></Field>
                <Field label="Maximum hours"><TextInput name="maximumNotionalHours" type="number" min="1" /></Field>
              </div>
            </GovernedOperationForm>
          </GovernedActionPanel>
        </aside>
      ) : null}
    </div>
  );
}
