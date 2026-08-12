"use client";

import type { PeopleOperationReferences, PersonDetail } from "@veza/contracts";
import {
  Checkbox,
  DateInput,
  Field,
  Select,
  TextInput,
} from "@veza/ui";
import {
  GovernedActionPanel,
  GovernedOperationForm,
} from "../../components/governed-operation";

function personOperationPath(personId: string, operation: string): string {
  return `/api/people/${personId}/operations/${operation}`;
}

function personVersion(person: PersonDetail): Readonly<{ expectedPersonVersion: number }> {
  return { expectedPersonVersion: person.version };
}

export function PersonAdministrationRecordActions({
  person,
  institutionId,
  references,
}: {
  person: PersonDetail;
  institutionId: string;
  references: PeopleOperationReferences;
}) {
  return (
    <>
      <GovernedActionPanel context="Contact" title="Add contact point" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "contacts")}
          institutionId={institutionId}
          submitLabel="Add contact"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            kind: form.get("kind"),
            value: form.get("value"),
            label: form.get("label") || undefined,
            isPrimary: form.get("isPrimary") === "on",
          })}
        >
          <Field label="Type">
            <Select name="kind" defaultValue="email">
              <option value="email">Email</option>
              <option value="mobile">Mobile</option>
              <option value="telephone">Telephone</option>
            </Select>
          </Field>
          <Field label="Contact value"><TextInput name="value" required maxLength={320} /></Field>
          <Field label="Label"><TextInput name="label" maxLength={60} placeholder="Home, work or primary" /></Field>
          <Checkbox name="isPrimary" label="Primary contact" />
        </GovernedOperationForm>
      </GovernedActionPanel>

      <GovernedActionPanel context="Location" title="Record address" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "addresses")}
          institutionId={institutionId}
          submitLabel="Record address"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            addressType: form.get("addressType"),
            address: {
              line1: form.get("line1"),
              line2: form.get("line2"),
              city: form.get("city"),
              region: form.get("region"),
              postalCode: form.get("postalCode"),
              countryCode: form.get("countryCode"),
            },
            isPrimary: form.get("isPrimary") === "on",
          })}
        >
          <Field label="Address type">
            <Select name="addressType" defaultValue="residential">
              <option value="residential">Residential</option>
              <option value="postal">Postal</option>
              <option value="work">Work</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Address line 1"><TextInput name="line1" required maxLength={160} /></Field>
          <Field label="Address line 2"><TextInput name="line2" maxLength={160} /></Field>
          <div className="person-admin-row">
            <Field label="City"><TextInput name="city" required maxLength={100} /></Field>
            <Field label="Province or region"><TextInput name="region" maxLength={100} /></Field>
          </div>
          <div className="person-admin-row">
            <Field label="Postal code"><TextInput name="postalCode" maxLength={20} /></Field>
            <Field label="Country"><TextInput name="countryCode" defaultValue="ZA" maxLength={2} /></Field>
          </div>
          <Checkbox name="isPrimary" label="Primary address" />
        </GovernedOperationForm>
      </GovernedActionPanel>

      <GovernedActionPanel context="Identifier" title="Add institutional identifier" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "identifiers")}
          institutionId={institutionId}
          submitLabel="Add identifier"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            identifierType: form.get("identifierType"),
            identifierValue: form.get("identifierValue"),
            issuingAuthority: form.get("issuingAuthority") || undefined,
          })}
        >
          <Field label="Identifier type">
            <TextInput name="identifierType" required maxLength={80} placeholder="Student number" />
          </Field>
          <Field label="Identifier value"><TextInput name="identifierValue" required maxLength={200} /></Field>
          <Field label="Issuing authority"><TextInput name="issuingAuthority" maxLength={160} /></Field>
        </GovernedOperationForm>
      </GovernedActionPanel>

      <GovernedActionPanel context="Organisation" title="Assign organisational unit" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "organisational-assignments")}
          institutionId={institutionId}
          submitLabel="Create assignment"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            organisationalUnitId: form.get("organisationalUnitId"),
            assignmentType: form.get("assignmentType"),
            title: form.get("title") || undefined,
            isPrimary: form.get("isPrimary") === "on",
            validFrom: form.get("validFrom"),
            validUntil: form.get("validUntil") || undefined,
          })}
        >
          <Field label="Organisational unit">
            <Select name="organisationalUnitId" required defaultValue="">
              <option value="" disabled>Select a unit</option>
              {references.organisationalUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.displayName} · {unit.code}</option>
              ))}
            </Select>
          </Field>
          <Field label="Assignment type">
            <TextInput name="assignmentType" required maxLength={80} placeholder="Academic, administrative or advisory" />
          </Field>
          <Field label="Title"><TextInput name="title" maxLength={160} /></Field>
          <div className="person-admin-row">
            <Field label="Effective from"><DateInput name="validFrom" required /></Field>
            <Field label="Effective until"><DateInput name="validUntil" /></Field>
          </div>
          <Checkbox name="isPrimary" label="Primary assignment" />
        </GovernedOperationForm>
      </GovernedActionPanel>

      {person.staff ? (
        <GovernedActionPanel context="Employment" title="Record staff engagement" className="person-admin-action">
          <GovernedOperationForm
            path={personOperationPath(person.id, "staff-engagements")}
            institutionId={institutionId}
            submitLabel="Record engagement"
            className="person-admin-form vz-field-list"
            errorClassName="people-error"
            buildInput={(form) => ({
              ...personVersion(person),
              organisationalUnitId: form.get("organisationalUnitId") || undefined,
              engagementType: form.get("engagementType"),
              employeeNumber: form.get("employeeNumber") || undefined,
              title: form.get("title") || undefined,
              startedOn: form.get("startedOn"),
            })}
          >
            <Field label="Engagement type">
              <Select name="engagementType" defaultValue="employee">
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
                <option value="volunteer">Volunteer</option>
                <option value="external">External</option>
              </Select>
            </Field>
            <Field label="Organisational unit">
              <Select name="organisationalUnitId" defaultValue="">
                <option value="">No unit</option>
                {references.organisationalUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.displayName} · {unit.code}</option>
                ))}
              </Select>
            </Field>
            <Field label="Employee number"><TextInput name="employeeNumber" maxLength={80} /></Field>
            <Field label="Position title"><TextInput name="title" maxLength={160} /></Field>
            <Field label="Start date"><DateInput name="startedOn" required /></Field>
          </GovernedOperationForm>
        </GovernedActionPanel>
      ) : null}
    </>
  );
}
