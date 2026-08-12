"use client";

import type { PeopleOperationReferences, PersonDetail } from "@veza/contracts";
import {
  Checkbox,
  DateInput,
  Field,
  FieldGroup,
  Select,
  Textarea,
  TextInput,
} from "@veza/ui";
import {
  GovernedActionPanel,
  GovernedOperationForm,
} from "../../components/governed-operation";

const relationshipTypes = [
  "guardian",
  "emergency-contact",
  "authorised-contact",
  "sponsor",
  "employer",
  "advisor",
] as const;

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function personOperationPath(personId: string, operation: string): string {
  return `/api/people/${personId}/operations/${operation}`;
}

function personVersion(person: PersonDetail): Readonly<{ expectedPersonVersion: number }> {
  return { expectedPersonVersion: person.version };
}

export function PersonAdministrationIdentityActions({
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
      {!person.userId ? (
        <>
          <GovernedActionPanel context="Identity" title="Invite a new identity" className="person-admin-action">
            <GovernedOperationForm
              path={personOperationPath(person.id, "identity-invitations")}
              institutionId={institutionId}
              submitLabel="Send secure invitation"
              className="person-admin-form vz-field-list"
              errorClassName="people-error"
              buildInput={(form) => ({
                ...personVersion(person),
                email: form.get("email"),
                roleKey: form.get("roleKey"),
                expiresInDays: Number(form.get("expiresInDays") ?? 7),
              })}
            >
              <Field label="Verified email"><TextInput name="email" type="email" required maxLength={320} /></Field>
              <Field label="Institution role">
                <Select name="roleKey" defaultValue={person.learner ? "learner" : "instructor"}>
                  <option value="learner">Learner</option>
                  <option value="guardian-sponsor">Guardian or sponsor</option>
                  <option value="instructor">Instructor</option>
                  <option value="assessor">Assessor</option>
                  <option value="moderator">Moderator</option>
                  <option value="course-manager">Course manager</option>
                  <option value="curriculum-manager">Curriculum manager</option>
                  <option value="registrar">Registrar</option>
                </Select>
              </Field>
              <Field label="Invitation validity">
                <Select name="expiresInDays" defaultValue="7">
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </Select>
              </Field>
            </GovernedOperationForm>
          </GovernedActionPanel>

          <GovernedActionPanel context="Identity" title="Link an existing tenant identity" className="person-admin-action">
            <GovernedOperationForm
              path={personOperationPath(person.id, "identity-links")}
              institutionId={institutionId}
              submitLabel="Link verified identity"
              className="person-admin-form vz-field-list"
              errorClassName="people-error"
              buildInput={(form) => ({
                ...personVersion(person),
                userId: form.get("userId"),
                reason: form.get("reason"),
              })}
            >
              <Field label="Active identity">
                <Select name="userId" required defaultValue="">
                  <option value="" disabled>Select an identity</option>
                  {references.linkableIdentities.map((identity) => (
                    <option key={identity.userId} value={identity.userId}>
                      {identity.displayName}{identity.email ? ` · ${identity.email}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Link reason"><Textarea name="reason" minLength={10} maxLength={1000} required /></Field>
            </GovernedOperationForm>
          </GovernedActionPanel>
        </>
      ) : null}

      <GovernedActionPanel context="Relationship" title="Invite guardian or authorised contact" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "relationship-invitations")}
          institutionId={institutionId}
          submitLabel="Create and invite contact"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            relationshipType: form.get("relationshipType"),
            givenName: form.get("givenName"),
            familyName: form.get("familyName"),
            email: form.get("email"),
            canReceiveCommunications: form.get("canReceiveCommunications") === "on",
            canAccessRecords: form.get("canAccessRecords") === "on",
            startsOn: form.get("startsOn"),
            endsOn: form.get("endsOn") || undefined,
            expiresInDays: 7,
          })}
        >
          <Field label="Relationship type">
            <Select name="relationshipType" defaultValue="guardian">
              {relationshipTypes.map((relationshipType) => (
                <option key={relationshipType} value={relationshipType}>{label(relationshipType)}</option>
              ))}
            </Select>
          </Field>
          <div className="person-admin-row">
            <Field label="Given name"><TextInput name="givenName" required maxLength={120} /></Field>
            <Field label="Family name"><TextInput name="familyName" required maxLength={120} /></Field>
          </div>
          <Field label="Email"><TextInput name="email" type="email" required maxLength={320} /></Field>
          <div className="person-admin-row">
            <Field label="Starts on"><DateInput name="startsOn" required /></Field>
            <Field label="Ends on"><DateInput name="endsOn" /></Field>
          </div>
          <Checkbox name="canReceiveCommunications" label="Receive communications" />
          <Checkbox name="canAccessRecords" label="Access permitted records" />
        </GovernedOperationForm>
      </GovernedActionPanel>

      <GovernedActionPanel context="Privacy" title="Record consent" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "consents")}
          institutionId={institutionId}
          submitLabel="Record consent"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            purposeCode: form.get("purposeCode"),
            status: form.get("status"),
            evidence: {
              source: form.get("evidenceSource"),
              recordedNote: form.get("evidenceNote"),
            },
            grantedAt: form.get("status") === "granted" ? new Date().toISOString() : undefined,
            withdrawnAt: form.get("status") === "withdrawn" ? new Date().toISOString() : undefined,
            expiresAt: form.get("expiresAt") || undefined,
          })}
        >
          <Field label="Purpose code"><TextInput name="purposeCode" required maxLength={120} placeholder="communications.email" /></Field>
          <Field label="Consent state">
            <Select name="status" defaultValue="granted">
              <option value="granted">Granted</option>
              <option value="withheld">Withheld</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="expired">Expired</option>
            </Select>
          </Field>
          <Field label="Evidence source">
            <TextInput name="evidenceSource" required maxLength={160} placeholder="Signed form, portal or recorded call" />
          </Field>
          <Field label="Evidence note"><Textarea name="evidenceNote" required minLength={10} maxLength={1000} /></Field>
          <Field label="Expires at"><TextInput name="expiresAt" type="datetime-local" /></Field>
        </GovernedOperationForm>
      </GovernedActionPanel>

      <GovernedActionPanel context="Privacy" title="Add disclosure restriction" className="person-admin-action">
        <GovernedOperationForm
          path={personOperationPath(person.id, "disclosure-restrictions")}
          institutionId={institutionId}
          submitLabel="Apply restriction"
          className="person-admin-form vz-field-list"
          errorClassName="people-error"
          buildInput={(form) => ({
            ...personVersion(person),
            restrictionCode: form.get("restrictionCode"),
            reason: form.get("reason"),
            appliesToRelationshipTypes: form.getAll("relationshipTypes"),
            effectiveFrom: form.get("effectiveFrom"),
            effectiveUntil: form.get("effectiveUntil") || undefined,
          })}
        >
          <Field label="Restriction code">
            <TextInput name="restrictionCode" required maxLength={120} placeholder="no-address-disclosure" />
          </Field>
          <Field label="Reason"><Textarea name="reason" minLength={10} maxLength={1000} required /></Field>
          <FieldGroup legend="Applies to">
            {relationshipTypes.map((relationshipType) => (
              <Checkbox
                key={relationshipType}
                name="relationshipTypes"
                value={relationshipType}
                label={label(relationshipType)}
              />
            ))}
          </FieldGroup>
          <div className="person-admin-row">
            <Field label="Effective from"><DateInput name="effectiveFrom" required /></Field>
            <Field label="Effective until"><DateInput name="effectiveUntil" /></Field>
          </div>
        </GovernedOperationForm>
      </GovernedActionPanel>
    </>
  );
}
