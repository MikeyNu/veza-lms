export type ContactPointKind = "email" | "mobile" | "telephone";
export type AddressType = "residential" | "postal" | "work" | "other";
export type StaffEngagementStatus = "planned" | "active" | "on_leave" | "ended" | "cancelled";
export type IdentityLinkStatus = "pending" | "linked" | "cancelled" | "expired" | "failed";
export type DataSubjectRequestStatus = "requested" | "processing" | "ready" | "delivered" | "rejected" | "cancelled";

export interface PersonContactPointRecord {
  readonly id: string;
  readonly version: number;
  readonly kind: ContactPointKind;
  readonly type: "email" | "phone";
  readonly value: string;
  readonly label?: string;
  readonly isPrimary: boolean;
  readonly isVerified: boolean;
  readonly verifiedAt?: string;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface PersonAddressRecord {
  readonly id: string;
  readonly version: number;
  readonly addressType: AddressType;
  readonly address: Readonly<Record<string, string>>;
  readonly isPrimary: boolean;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface PersonIdentifierRecord {
  readonly id: string;
  readonly version: number;
  readonly institutionId?: string;
  readonly identifierType: string;
  readonly identifierValue: string;
  readonly issuingAuthority?: string;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface PersonOrganisationalAssignmentRecord {
  readonly id: string;
  readonly version: number;
  readonly institutionId: string;
  readonly organisationalUnitId: string;
  readonly assignmentType: string;
  readonly title?: string;
  readonly isPrimary: boolean;
  readonly validFrom: string;
  readonly validUntil?: string;
}

export interface StaffEngagementRecord {
  readonly id: string;
  readonly version: number;
  readonly institutionId: string;
  readonly organisationalUnitId?: string;
  readonly engagementType: "employee" | "contractor" | "volunteer" | "external";
  readonly employeeNumber?: string;
  readonly title?: string;
  readonly status: StaffEngagementStatus;
  readonly startedOn: string;
  readonly endedOn?: string;
}

export interface PersonConsentRecord {
  readonly id: string;
  readonly version: number;
  readonly relationshipId?: string;
  readonly purposeCode: string;
  readonly status: "granted" | "withheld" | "withdrawn" | "expired";
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly grantedAt?: string;
  readonly expiresAt?: string;
  readonly withdrawnAt?: string;
}

export interface PersonDisclosureRestrictionRecord {
  readonly id: string;
  readonly version: number;
  readonly restrictionCode: string;
  readonly reason: string;
  readonly appliesToRelationshipTypes: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly liftedAt?: string;
}

export interface PersonIdentityLinkRequestRecord {
  readonly id: string;
  readonly personId: string;
  readonly institutionId: string;
  readonly membershipInvitationId?: string;
  readonly requestedEmail?: string;
  readonly requestedRoleKey?: string;
  readonly status: IdentityLinkStatus;
  readonly linkedUserId?: string;
  readonly expiresAt?: string;
  readonly completedAt?: string;
  readonly version: number;
}

export interface PersonDataSubjectRequestRecord {
  readonly id: string;
  readonly personId: string;
  readonly requestType: "access" | "export";
  readonly status: DataSubjectRequestStatus;
  readonly reason: string;
  readonly exportFormat?: "json";
  readonly exportChecksum?: string;
  readonly requestedAt: string;
  readonly readyAt?: string;
  readonly deliveredAt?: string;
  readonly version: number;
}

export interface PeopleImportRowRecord {
  readonly id: string;
  readonly rowNumber: number;
  readonly normalizedRecord?: Readonly<Record<string, unknown>>;
  readonly validationStatus: "pending" | "valid" | "invalid" | "duplicate" | "committed";
  readonly validationErrors: readonly Readonly<Record<string, unknown>>[];
  readonly matchedPersonId?: string;
  readonly committedPersonId?: string;
  readonly reconciliationAction?: "corrected" | "link-existing" | "create-new" | "skip";
  readonly reconciliationReason?: string;
  readonly version: number;
}

export interface PeopleOperationReferences {
  readonly institutionId: string;
  readonly organisationalUnits: readonly {
    readonly id: string;
    readonly code: string;
    readonly displayName: string;
    readonly unitType: string;
  }[];
  readonly linkableIdentities: readonly {
    readonly userId: string;
    readonly displayName: string;
    readonly email?: string;
    readonly roles: readonly string[];
  }[];
}
