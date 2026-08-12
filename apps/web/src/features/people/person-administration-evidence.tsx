"use client";

import type {
  PeopleOperationReferences,
  PersonDetail,
  StaffEngagementRecord,
} from "@veza/contracts";
import { Button, DateInput, Field, Textarea } from "@veza/ui";
import { GovernedOperationForm } from "../../components/governed-operation";

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

function EvidenceList({
  empty,
  children,
}: {
  empty: string;
  children: React.ReactNode;
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
  if (!["planned", "active", "on_leave"].includes(engagement.status)) return null;
  return (
    <details className="person-inline-action">
      <summary>End engagement</summary>
      <GovernedOperationForm
        path={`/api/people/staff-engagements/${engagement.id}/end`}
        institutionId={institutionId}
        submitLabel="Confirm end"
        className="person-inline-action__form vz-field-list"
        errorClassName="people-error"
        buildInput={(form) => ({
          expectedVersion: engagement.version,
          endedOn: form.get("endedOn"),
          reason: form.get("reason"),
        })}
      >
        <Field label="End date"><DateInput name="endedOn" required /></Field>
        <Field label="Recorded reason">
          <Textarea name="reason" minLength={10} maxLength={1000} required />
        </Field>
      </GovernedOperationForm>
    </details>
  );
}

export function PersonAdministrationEvidence({
  person,
  references,
  institutionId,
  canManage,
}: {
  person: PersonDetail;
  references?: PeopleOperationReferences;
  institutionId?: string;
  canManage: boolean;
}) {
  const unitName = new Map(
    (references?.organisationalUnits ?? []).map((unit) => [unit.id, unit.displayName]),
  );

  return (
    <div className="person-evidence-grid">
      <article className="person-evidence-card">
        <header><span>Addresses</span><strong>{person.addresses.length}</strong></header>
        <EvidenceList empty="No address evidence recorded.">
          {person.addresses.map((address) => (
            <div key={address.id}>
              <strong>{label(address.addressType)}</strong>
              <span>{Object.values(address.address).filter(Boolean).join(", ")}</span>
              <small>{address.isPrimary ? "Primary" : "Secondary"} · effective {date(address.validFrom)}</small>
            </div>
          ))}
        </EvidenceList>
      </article>

      <article className="person-evidence-card">
        <header><span>Identifiers</span><strong>{person.identifiers.length}</strong></header>
        <EvidenceList empty="No institutional identifiers recorded.">
          {person.identifiers.map((identifier) => (
            <div key={identifier.id}>
              <strong>{label(identifier.identifierType)}</strong>
              <span>{identifier.identifierValue}</span>
              <small>{identifier.issuingAuthority ?? "Institution-issued"} · effective {date(identifier.validFrom)}</small>
            </div>
          ))}
        </EvidenceList>
      </article>

      <article className="person-evidence-card">
        <header><span>Organisational assignments</span><strong>{person.organisationalAssignments.length}</strong></header>
        <EvidenceList empty="No organisational assignment recorded.">
          {person.organisationalAssignments.map((assignment) => (
            <div key={assignment.id}>
              <strong>{assignment.title ?? label(assignment.assignmentType)}</strong>
              <span>{unitName.get(assignment.organisationalUnitId) ?? assignment.organisationalUnitId}</span>
              <small>{assignment.isPrimary ? "Primary" : "Additional"} · {date(assignment.validFrom)}</small>
            </div>
          ))}
        </EvidenceList>
      </article>

      <article className="person-evidence-card">
        <header><span>Staff engagement history</span><strong>{person.staffEngagements.length}</strong></header>
        <EvidenceList empty="No staff engagement history recorded.">
          {person.staffEngagements.map((engagement) => (
            <div key={engagement.id}>
              <strong>{engagement.title ?? label(engagement.engagementType)}</strong>
              <span>{engagement.employeeNumber ?? "No employee number"} · {label(engagement.status)}</span>
              <small>{date(engagement.startedOn)} to {date(engagement.endedOn)}</small>
              {canManage && institutionId ? (
                <EndEngagement engagement={engagement} institutionId={institutionId} />
              ) : null}
            </div>
          ))}
        </EvidenceList>
      </article>

      <article className="person-evidence-card sensitive">
        <header><span>Consent evidence</span><strong>{person.consents.length}</strong></header>
        <EvidenceList empty="No consent records recorded.">
          {person.consents.map((consent) => (
            <div key={consent.id}>
              <strong>{label(consent.purposeCode)}</strong>
              <span>{label(consent.status)}</span>
              <small>{consent.grantedAt ? `Granted ${date(consent.grantedAt)}` : "No grant timestamp"}</small>
            </div>
          ))}
        </EvidenceList>
      </article>

      <article className="person-evidence-card sensitive">
        <header><span>Disclosure restrictions</span><strong>{person.disclosureRestrictions.length}</strong></header>
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
        <header><span>Identity linkage</span><strong>{person.userId ? "Linked" : "Unlinked"}</strong></header>
        <EvidenceList empty="No identity invitation or link evidence recorded.">
          {person.identityLinkRequests.map((linkRequest) => (
            <div key={linkRequest.id}>
              <strong>{label(linkRequest.status)}</strong>
              <span>{linkRequest.requestedEmail ?? linkRequest.linkedUserId ?? "Identity request"}</span>
              <small>{linkRequest.requestedRoleKey ? `Role ${label(linkRequest.requestedRoleKey)}` : "Direct verified link"}</small>
            </div>
          ))}
        </EvidenceList>
      </article>

      <article className="person-evidence-card">
        <header><span>Data-subject requests</span><strong>{person.dataSubjectRequests.length}</strong></header>
        <EvidenceList empty="No access or export requests recorded.">
          {person.dataSubjectRequests.map((subjectRequest) => (
            <div key={subjectRequest.id}>
              <strong>{label(subjectRequest.requestType)}</strong>
              <span>{label(subjectRequest.status)}</span>
              <small>
                Requested {date(subjectRequest.requestedAt)}
                {subjectRequest.exportChecksum ? ` · checksum ${subjectRequest.exportChecksum.slice(0, 12)}...` : ""}
              </small>
            </div>
          ))}
        </EvidenceList>
      </article>
    </div>
  );
}
