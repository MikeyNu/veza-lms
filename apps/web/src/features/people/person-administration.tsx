"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  PeopleOperationReferences,
  PersonDetail,
  StaffEngagementRecord,
} from "@veza/contracts";

function date(value?: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

async function requestOperation(
  personId: string,
  operation: string,
  institutionId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/people/${personId}/operations/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ institutionId, ...input }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof body.message === "string" ? body.message : "People operation failed",
    );
  }
  return body;
}

function ActionPanel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="person-admin-action">
      <summary>
        <span>
          <small>{eyebrow}</small>
          <strong>{title}</strong>
        </span>
        <b aria-hidden="true">＋</b>
      </summary>
      {children}
    </details>
  );
}

function ManagedForm({
  person,
  institutionId,
  operation,
  children,
  buildInput,
  submitLabel,
}: {
  person: PersonDetail;
  institutionId: string;
  operation: string;
  children: ReactNode;
  buildInput: (form: FormData) => Record<string, unknown>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    try {
      await requestOperation(person.id, operation, institutionId, {
        expectedPersonVersion: person.version,
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
    <form className="person-admin-form" onSubmit={submit}>
      {children}
      {message ? (
        <p className="people-error" role="alert">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function EvidenceList({
  empty,
  children,
}: {
  empty: string;
  children: ReactNode;
}) {
  return <div className="person-evidence-list">{children || <p>{empty}</p>}</div>;
}

function EndEngagement({
  engagement,
  institutionId,
}: {
  engagement: StaffEngagementRecord;
  institutionId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  if (!["planned", "active", "on_leave"].includes(engagement.status)) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/people/staff-engagements/${engagement.id}/end`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            institutionId,
            expectedVersion: engagement.version,
            endedOn: form.get("endedOn"),
            reason: form.get("reason"),
          }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Engagement could not be ended");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Operation failed");
    }
  }
  return (
    <details className="person-inline-action">
      <summary>End engagement</summary>
      <form onSubmit={submit}>
        <label>
          End date
          <input name="endedOn" type="date" required />
        </label>
        <label>
          Recorded reason
          <textarea name="reason" minLength={10} maxLength={1000} required />
        </label>
        {message ? <p className="people-error">{message}</p> : null}
        <button disabled={state === "saving"}>
          {state === "saving" ? "Ending…" : "Confirm end"}
        </button>
      </form>
    </details>
  );
}

export function PersonAdministration({
  person,
  institutionId,
  references,
  canManage,
}: {
  person: PersonDetail;
  institutionId?: string;
  references?: PeopleOperationReferences;
  canManage: boolean;
}) {
  const router = useRouter();
  const [exportState, setExportState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [exportMessage, setExportMessage] = useState("");
  const unitName = new Map(
    (references?.organisationalUnits ?? []).map((unit) => [unit.id, unit.displayName]),
  );

  async function exportRecord() {
    if (!institutionId) return;
    setExportState("saving");
    setExportMessage("");
    try {
      const result = await requestOperation(
        person.id,
        "data-subject-requests",
        institutionId,
        {
          requestType: "export",
          reason:
            "Institution administrator generated an authorised data-subject export for review and delivery.",
        },
      );
      const snapshot = result.snapshot;
      if (!snapshot || typeof snapshot !== "object") {
        throw new Error("Export snapshot was not returned");
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `veza-person-${person.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportState("idle");
      router.refresh();
    } catch (error) {
      setExportState("error");
      setExportMessage(error instanceof Error ? error.message : "Export failed");
    }
  }

  return (
    <section className="person-administration">
      <header>
        <div>
          <p>INSTITUTION-CONTROLLED EVIDENCE</p>
          <h2>Identity, engagement and privacy record</h2>
          <span>
            Global identity remains separate from the institution-owned person record.
          </span>
        </div>
        {canManage && institutionId ? (
          <button
            type="button"
            className="person-export-button"
            onClick={exportRecord}
            disabled={exportState === "saving"}
          >
            {exportState === "saving" ? "Preparing export…" : "Export person record"}
          </button>
        ) : null}
      </header>
      {exportMessage ? (
        <p className="people-error" role="alert">
          {exportMessage}
        </p>
      ) : null}

      <div className="person-evidence-grid">
        <article className="person-evidence-card">
          <header>
            <span>ADDRESSES</span>
            <strong>{person.addresses.length}</strong>
          </header>
          <EvidenceList empty="No address evidence recorded.">
            {person.addresses.map((address) => (
              <div key={address.id}>
                <strong>{label(address.addressType)}</strong>
                <span>{Object.values(address.address).filter(Boolean).join(", ")}</span>
                <small>
                  {address.isPrimary ? "Primary" : "Secondary"} · effective {date(address.validFrom)}
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card">
          <header>
            <span>IDENTIFIERS</span>
            <strong>{person.identifiers.length}</strong>
          </header>
          <EvidenceList empty="No institutional identifiers recorded.">
            {person.identifiers.map((identifier) => (
              <div key={identifier.id}>
                <strong>{label(identifier.identifierType)}</strong>
                <span>{identifier.identifierValue}</span>
                <small>
                  {identifier.issuingAuthority ?? "Institution-issued"} · effective {date(identifier.validFrom)}
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card">
          <header>
            <span>ORGANISATIONAL ASSIGNMENTS</span>
            <strong>{person.organisationalAssignments.length}</strong>
          </header>
          <EvidenceList empty="No organisational assignment recorded.">
            {person.organisationalAssignments.map((assignment) => (
              <div key={assignment.id}>
                <strong>{assignment.title ?? label(assignment.assignmentType)}</strong>
                <span>
                  {unitName.get(assignment.organisationalUnitId) ??
                    assignment.organisationalUnitId}
                </span>
                <small>
                  {assignment.isPrimary ? "Primary" : "Additional"} · {date(assignment.validFrom)}
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card">
          <header>
            <span>STAFF ENGAGEMENT HISTORY</span>
            <strong>{person.staffEngagements.length}</strong>
          </header>
          <EvidenceList empty="No staff engagement history recorded.">
            {person.staffEngagements.map((engagement) => (
              <div key={engagement.id}>
                <strong>{engagement.title ?? label(engagement.engagementType)}</strong>
                <span>
                  {engagement.employeeNumber ?? "No employee number"} · {label(engagement.status)}
                </span>
                <small>
                  {date(engagement.startedOn)} to {date(engagement.endedOn)}
                </small>
                {canManage && institutionId ? (
                  <EndEngagement
                    engagement={engagement}
                    institutionId={institutionId}
                  />
                ) : null}
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card sensitive">
          <header>
            <span>CONSENT EVIDENCE</span>
            <strong>{person.consents.length}</strong>
          </header>
          <EvidenceList empty="No consent records recorded.">
            {person.consents.map((consent) => (
              <div key={consent.id}>
                <strong>{label(consent.purposeCode)}</strong>
                <span>{label(consent.status)}</span>
                <small>
                  {consent.grantedAt ? `Granted ${date(consent.grantedAt)}` : "No grant timestamp"}
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card sensitive">
          <header>
            <span>DISCLOSURE RESTRICTIONS</span>
            <strong>{person.disclosureRestrictions.length}</strong>
          </header>
          <EvidenceList empty="No disclosure restrictions recorded.">
            {person.disclosureRestrictions.map((restriction) => (
              <div key={restriction.id}>
                <strong>{label(restriction.restrictionCode)}</strong>
                <span>{restriction.reason}</span>
                <small>
                  Effective {date(restriction.effectiveFrom)} · applies to {restriction.appliesToRelationshipTypes.length || "all"} relationship types
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card">
          <header>
            <span>IDENTITY LINKAGE</span>
            <strong>{person.userId ? "Linked" : "Unlinked"}</strong>
          </header>
          <EvidenceList empty="No identity invitation or link evidence recorded.">
            {person.identityLinkRequests.map((linkRequest) => (
              <div key={linkRequest.id}>
                <strong>{label(linkRequest.status)}</strong>
                <span>{linkRequest.requestedEmail ?? linkRequest.linkedUserId ?? "Identity request"}</span>
                <small>
                  {linkRequest.requestedRoleKey
                    ? `Role ${label(linkRequest.requestedRoleKey)}`
                    : "Direct verified link"}
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>

        <article className="person-evidence-card">
          <header>
            <span>DATA-SUBJECT REQUESTS</span>
            <strong>{person.dataSubjectRequests.length}</strong>
          </header>
          <EvidenceList empty="No access or export requests recorded.">
            {person.dataSubjectRequests.map((subjectRequest) => (
              <div key={subjectRequest.id}>
                <strong>{label(subjectRequest.requestType)}</strong>
                <span>{label(subjectRequest.status)}</span>
                <small>
                  Requested {date(subjectRequest.requestedAt)}
                  {subjectRequest.exportChecksum
                    ? ` · checksum ${subjectRequest.exportChecksum.slice(0, 12)}…`
                    : ""}
                </small>
              </div>
            ))}
          </EvidenceList>
        </article>
      </div>

      {canManage && institutionId && references ? (
        <aside className="person-admin-actions" aria-label="Person administration actions">
          <header>
            <p>AUTHORITATIVE ACTIONS</p>
            <h3>Extend this person record</h3>
          </header>

          <ActionPanel eyebrow="CONTACT" title="Add contact point">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="contacts"
              submitLabel="Add contact"
              buildInput={(form) => ({
                kind: form.get("kind"),
                value: form.get("value"),
                label: form.get("label") || undefined,
                isPrimary: form.get("isPrimary") === "on",
              })}
            >
              <label>
                Type
                <select name="kind" defaultValue="email">
                  <option value="email">Email</option>
                  <option value="mobile">Mobile</option>
                  <option value="telephone">Telephone</option>
                </select>
              </label>
              <label>
                Contact value
                <input name="value" required maxLength={320} />
              </label>
              <label>
                Label
                <input name="label" maxLength={60} placeholder="Home, work or primary" />
              </label>
              <label className="person-admin-check">
                <input name="isPrimary" type="checkbox" /> Primary contact
              </label>
            </ManagedForm>
          </ActionPanel>

          <ActionPanel eyebrow="LOCATION" title="Record address">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="addresses"
              submitLabel="Record address"
              buildInput={(form) => ({
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
              <label>
                Address type
                <select name="addressType" defaultValue="residential">
                  <option value="residential">Residential</option>
                  <option value="postal">Postal</option>
                  <option value="work">Work</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Address line 1
                <input name="line1" required maxLength={160} />
              </label>
              <label>
                Address line 2
                <input name="line2" maxLength={160} />
              </label>
              <div className="person-admin-row">
                <label>
                  City
                  <input name="city" required maxLength={100} />
                </label>
                <label>
                  Province or region
                  <input name="region" maxLength={100} />
                </label>
              </div>
              <div className="person-admin-row">
                <label>
                  Postal code
                  <input name="postalCode" maxLength={20} />
                </label>
                <label>
                  Country
                  <input name="countryCode" defaultValue="ZA" maxLength={2} />
                </label>
              </div>
              <label className="person-admin-check">
                <input name="isPrimary" type="checkbox" /> Primary address
              </label>
            </ManagedForm>
          </ActionPanel>

          <ActionPanel eyebrow="IDENTIFIER" title="Add institutional identifier">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="identifiers"
              submitLabel="Add identifier"
              buildInput={(form) => ({
                identifierType: form.get("identifierType"),
                identifierValue: form.get("identifierValue"),
                issuingAuthority: form.get("issuingAuthority") || undefined,
              })}
            >
              <label>
                Identifier type
                <input name="identifierType" required maxLength={80} placeholder="Student number" />
              </label>
              <label>
                Identifier value
                <input name="identifierValue" required maxLength={200} />
              </label>
              <label>
                Issuing authority
                <input name="issuingAuthority" maxLength={160} />
              </label>
            </ManagedForm>
          </ActionPanel>

          <ActionPanel eyebrow="ORGANISATION" title="Assign organisational unit">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="organisational-assignments"
              submitLabel="Create assignment"
              buildInput={(form) => ({
                institutionId,
                organisationalUnitId: form.get("organisationalUnitId"),
                assignmentType: form.get("assignmentType"),
                title: form.get("title") || undefined,
                isPrimary: form.get("isPrimary") === "on",
                validFrom: form.get("validFrom"),
                validUntil: form.get("validUntil") || undefined,
              })}
            >
              <label>
                Organisational unit
                <select name="organisationalUnitId" required defaultValue="">
                  <option value="" disabled>Select a unit</option>
                  {references.organisationalUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.displayName} · {unit.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignment type
                <input name="assignmentType" required maxLength={80} placeholder="Academic, administrative or advisory" />
              </label>
              <label>
                Title
                <input name="title" maxLength={160} />
              </label>
              <div className="person-admin-row">
                <label>
                  Effective from
                  <input name="validFrom" type="date" required />
                </label>
                <label>
                  Effective until
                  <input name="validUntil" type="date" />
                </label>
              </div>
              <label className="person-admin-check">
                <input name="isPrimary" type="checkbox" /> Primary assignment
              </label>
            </ManagedForm>
          </ActionPanel>

          {person.staff ? (
            <ActionPanel eyebrow="EMPLOYMENT" title="Record staff engagement">
              <ManagedForm
                person={person}
                institutionId={institutionId}
                operation="staff-engagements"
                submitLabel="Record engagement"
                buildInput={(form) => ({
                  institutionId,
                  organisationalUnitId:
                    form.get("organisationalUnitId") || undefined,
                  engagementType: form.get("engagementType"),
                  employeeNumber: form.get("employeeNumber") || undefined,
                  title: form.get("title") || undefined,
                  startedOn: form.get("startedOn"),
                })}
              >
                <label>
                  Engagement type
                  <select name="engagementType" defaultValue="employee">
                    <option value="employee">Employee</option>
                    <option value="contractor">Contractor</option>
                    <option value="volunteer">Volunteer</option>
                    <option value="external">External</option>
                  </select>
                </label>
                <label>
                  Organisational unit
                  <select name="organisationalUnitId" defaultValue="">
                    <option value="">No unit</option>
                    {references.organisationalUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.displayName} · {unit.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Employee number
                  <input name="employeeNumber" maxLength={80} />
                </label>
                <label>
                  Position title
                  <input name="title" maxLength={160} />
                </label>
                <label>
                  Start date
                  <input name="startedOn" type="date" required />
                </label>
              </ManagedForm>
            </ActionPanel>
          ) : null}

          {!person.userId ? (
            <>
              <ActionPanel eyebrow="IDENTITY" title="Invite a new identity">
                <ManagedForm
                  person={person}
                  institutionId={institutionId}
                  operation="identity-invitations"
                  submitLabel="Send secure invitation"
                  buildInput={(form) => ({
                    email: form.get("email"),
                    roleKey: form.get("roleKey"),
                    expiresInDays: Number(form.get("expiresInDays") ?? 7),
                  })}
                >
                  <label>
                    Verified email
                    <input name="email" type="email" required maxLength={320} />
                  </label>
                  <label>
                    Institution role
                    <select
                      name="roleKey"
                      defaultValue={person.learner ? "learner" : "instructor"}
                    >
                      <option value="learner">Learner</option>
                      <option value="guardian-sponsor">Guardian or sponsor</option>
                      <option value="instructor">Instructor</option>
                      <option value="assessor">Assessor</option>
                      <option value="moderator">Moderator</option>
                      <option value="course-manager">Course manager</option>
                      <option value="curriculum-manager">Curriculum manager</option>
                      <option value="registrar">Registrar</option>
                    </select>
                  </label>
                  <label>
                    Invitation validity
                    <select name="expiresInDays" defaultValue="7">
                      <option value="3">3 days</option>
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </label>
                </ManagedForm>
              </ActionPanel>

              <ActionPanel eyebrow="IDENTITY" title="Link an existing tenant identity">
                <ManagedForm
                  person={person}
                  institutionId={institutionId}
                  operation="identity-links"
                  submitLabel="Link verified identity"
                  buildInput={(form) => ({
                    userId: form.get("userId"),
                    reason: form.get("reason"),
                  })}
                >
                  <label>
                    Active identity
                    <select name="userId" required defaultValue="">
                      <option value="" disabled>Select an identity</option>
                      {references.linkableIdentities.map((identity) => (
                        <option key={identity.userId} value={identity.userId}>
                          {identity.displayName}
                          {identity.email ? ` · ${identity.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Link reason
                    <textarea name="reason" minLength={10} maxLength={1000} required />
                  </label>
                </ManagedForm>
              </ActionPanel>
            </>
          ) : null}

          <ActionPanel eyebrow="RELATIONSHIP" title="Invite guardian or authorised contact">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="relationship-invitations"
              submitLabel="Create and invite contact"
              buildInput={(form) => ({
                relationshipType: form.get("relationshipType"),
                givenName: form.get("givenName"),
                familyName: form.get("familyName"),
                email: form.get("email"),
                canReceiveCommunications:
                  form.get("canReceiveCommunications") === "on",
                canAccessRecords: form.get("canAccessRecords") === "on",
                startsOn: form.get("startsOn"),
                endsOn: form.get("endsOn") || undefined,
                expiresInDays: 7,
              })}
            >
              <label>
                Relationship type
                <select name="relationshipType" defaultValue="guardian">
                  <option value="guardian">Guardian</option>
                  <option value="emergency-contact">Emergency contact</option>
                  <option value="authorised-contact">Authorised contact</option>
                  <option value="sponsor">Sponsor</option>
                  <option value="employer">Employer</option>
                  <option value="advisor">Advisor</option>
                </select>
              </label>
              <div className="person-admin-row">
                <label>
                  Given name
                  <input name="givenName" required maxLength={120} />
                </label>
                <label>
                  Family name
                  <input name="familyName" required maxLength={120} />
                </label>
              </div>
              <label>
                Email
                <input name="email" type="email" required maxLength={320} />
              </label>
              <div className="person-admin-row">
                <label>
                  Starts on
                  <input name="startsOn" type="date" required />
                </label>
                <label>
                  Ends on
                  <input name="endsOn" type="date" />
                </label>
              </div>
              <label className="person-admin-check">
                <input name="canReceiveCommunications" type="checkbox" /> Receive communications
              </label>
              <label className="person-admin-check">
                <input name="canAccessRecords" type="checkbox" /> Access permitted records
              </label>
            </ManagedForm>
          </ActionPanel>

          <ActionPanel eyebrow="PRIVACY" title="Record consent">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="consents"
              submitLabel="Record consent"
              buildInput={(form) => ({
                purposeCode: form.get("purposeCode"),
                status: form.get("status"),
                evidence: {
                  source: form.get("evidenceSource"),
                  recordedNote: form.get("evidenceNote"),
                },
                grantedAt:
                  form.get("status") === "granted"
                    ? new Date().toISOString()
                    : undefined,
                withdrawnAt:
                  form.get("status") === "withdrawn"
                    ? new Date().toISOString()
                    : undefined,
                expiresAt: form.get("expiresAt") || undefined,
              })}
            >
              <label>
                Purpose code
                <input name="purposeCode" required maxLength={120} placeholder="communications.email" />
              </label>
              <label>
                Consent state
                <select name="status" defaultValue="granted">
                  <option value="granted">Granted</option>
                  <option value="withheld">Withheld</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
              <label>
                Evidence source
                <input name="evidenceSource" required maxLength={160} placeholder="Signed form, portal or recorded call" />
              </label>
              <label>
                Evidence note
                <textarea name="evidenceNote" required minLength={10} maxLength={1000} />
              </label>
              <label>
                Expires at
                <input name="expiresAt" type="datetime-local" />
              </label>
            </ManagedForm>
          </ActionPanel>

          <ActionPanel eyebrow="PRIVACY" title="Add disclosure restriction">
            <ManagedForm
              person={person}
              institutionId={institutionId}
              operation="disclosure-restrictions"
              submitLabel="Apply restriction"
              buildInput={(form) => ({
                restrictionCode: form.get("restrictionCode"),
                reason: form.get("reason"),
                appliesToRelationshipTypes: form.getAll("relationshipTypes"),
                effectiveFrom: form.get("effectiveFrom"),
                effectiveUntil: form.get("effectiveUntil") || undefined,
              })}
            >
              <label>
                Restriction code
                <input name="restrictionCode" required maxLength={120} placeholder="no-address-disclosure" />
              </label>
              <label>
                Reason
                <textarea name="reason" minLength={10} maxLength={1000} required />
              </label>
              <fieldset>
                <legend>Applies to</legend>
                {[
                  "guardian",
                  "emergency-contact",
                  "authorised-contact",
                  "sponsor",
                  "employer",
                  "advisor",
                ].map((relationshipType) => (
                  <label key={relationshipType} className="person-admin-check">
                    <input
                      name="relationshipTypes"
                      type="checkbox"
                      value={relationshipType}
                    />
                    {label(relationshipType)}
                  </label>
                ))}
              </fieldset>
              <div className="person-admin-row">
                <label>
                  Effective from
                  <input name="effectiveFrom" type="date" required />
                </label>
                <label>
                  Effective until
                  <input name="effectiveUntil" type="date" />
                </label>
              </div>
            </ManagedForm>
          </ActionPanel>
        </aside>
      ) : null}
    </section>
  );
}
