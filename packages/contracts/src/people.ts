export type PersonId = string & { readonly __brand: "PersonId" };
export type LearnerProfileId = string & { readonly __brand: "LearnerProfileId" };
export type StaffProfileId = string & { readonly __brand: "StaffProfileId" };
export type PersonRelationshipId = string & { readonly __brand: "PersonRelationshipId" };
export type PeopleImportId = string & { readonly __brand: "PeopleImportId" };

export type PersonStatus = "active" | "inactive" | "deceased" | "merged";
export type LearnerStatus = "applicant" | "active" | "suspended" | "withdrawn" | "completed";
export type StaffStatus = "active" | "leave" | "suspended" | "ended";
export type RelationshipType = "guardian" | "sponsor" | "employer" | "advisor" | "authorised-contact";
export type DuplicateReviewStatus = "open" | "confirmed-distinct" | "merge-approved" | "dismissed";
export type PeopleImportStatus = "uploaded" | "validating" | "ready" | "committing" | "completed" | "failed";

export interface PersonSummary {
  readonly id: PersonId; readonly version: number; readonly displayName: string;
  readonly givenName: string; readonly familyName: string; readonly preferredName?: string;
  readonly primaryEmail?: string; readonly status: PersonStatus; readonly learnerStatus?: LearnerStatus;
  readonly staffStatus?: StaffStatus; readonly institutionalIdentifiers: readonly string[]; readonly updatedAt: string;
}
export interface PersonDirectoryPage { readonly items: readonly PersonSummary[]; readonly page: { readonly nextCursor?: string; readonly limit: number }; }

export interface PersonDetail extends PersonSummary {
  readonly middleNames?: string; readonly dateOfBirth?: string; readonly locale?: string; readonly userId?: string;
  readonly contacts: readonly { readonly id: string; readonly type: "email" | "phone"; readonly value: string; readonly label?: string; readonly isPrimary: boolean; readonly verifiedAt?: string }[];
  readonly learner?: { readonly id: LearnerProfileId; readonly status: LearnerStatus; readonly admissionDate?: string; readonly completionDate?: string };
  readonly staff?: { readonly id: StaffProfileId; readonly status: StaffStatus; readonly employeeNumber?: string; readonly engagementType?: string };
  readonly relationships: readonly {
    readonly id: PersonRelationshipId; readonly version: number; readonly relatedPersonId: PersonId;
    readonly type: RelationshipType; readonly status: "pending" | "active" | "revoked" | "expired";
    readonly canReceiveCommunications: boolean; readonly canAccessRecords: boolean;
    readonly startsOn: string; readonly endsOn?: string;
  }[];
}

export interface DuplicateCandidate {
  readonly id: string;
  readonly leftPerson: { readonly id: PersonId; readonly displayName: string; readonly version: number };
  readonly rightPerson: { readonly id: PersonId; readonly displayName: string; readonly version: number };
  readonly matchScore: number; readonly reasons: unknown; readonly status: DuplicateReviewStatus; readonly createdAt: string;
}
export interface DuplicateCandidatePage { readonly items: readonly DuplicateCandidate[]; readonly page: { readonly nextCursor?: string; readonly limit: number }; }

export interface PeopleImportDryRun {
  readonly importId: PeopleImportId; readonly status: PeopleImportStatus; readonly totalRows: number;
  readonly validRows: number; readonly invalidRows: number; readonly duplicateRows: number;
  readonly errors: readonly { readonly rowNumber: number; readonly field?: string; readonly code: string; readonly message: string }[];
}
