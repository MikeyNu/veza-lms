import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const relationshipTypes = [
  "guardian",
  "sponsor",
  "employer",
  "advisor",
  "emergency-contact",
  "authorised-contact",
] as const;
const inviteRoles = [
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
] as const;

class PersonVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPersonVersion!: number;
}

export class CreatePersonContactPointDto extends PersonVersionDto {
  @IsIn(["email", "mobile", "telephone"])
  kind!: "email" | "mobile" | "telephone";

  @IsString()
  @MinLength(3)
  @MaxLength(320)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsBoolean()
  isPrimary!: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;
}

export class CreatePersonAddressDto extends PersonVersionDto {
  @IsIn(["residential", "postal", "work", "other"])
  addressType!: "residential" | "postal" | "work" | "other";

  @IsObject()
  address!: Record<string, string>;

  @IsBoolean()
  isPrimary!: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;
}

export class CreatePersonIdentifierDto extends PersonVersionDto {
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  identifierType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  identifierValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  issuingAuthority?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;
}

export class CreateOrganisationalAssignmentDto extends PersonVersionDto {
  @IsUUID()
  institutionId!: string;

  @IsUUID()
  organisationalUnitId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  assignmentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsBoolean()
  isPrimary!: boolean;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class CreateStaffEngagementDto extends PersonVersionDto {
  @IsUUID()
  institutionId!: string;

  @IsOptional()
  @IsUUID()
  organisationalUnitId?: string;

  @IsIn(["employee", "contractor", "volunteer", "external"])
  engagementType!: "employee" | "contractor" | "volunteer" | "external";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  employeeNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsDateString()
  startedOn!: string;
}

export class EndStaffEngagementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDateString()
  endedOn!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CreatePersonConsentDto extends PersonVersionDto {
  @IsOptional()
  @IsUUID()
  relationshipId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  purposeCode!: string;

  @IsIn(["granted", "withheld", "withdrawn", "expired"])
  status!: "granted" | "withheld" | "withdrawn" | "expired";

  @IsObject()
  evidence!: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  grantedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsDateString()
  withdrawnAt?: string;
}

export class CreateDisclosureRestrictionDto extends PersonVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  restrictionCode!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  appliesToRelationshipTypes?: (typeof relationshipTypes)[number][];

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;
}

export class InvitePersonIdentityDto extends PersonVersionDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(inviteRoles)
  roleKey!: (typeof inviteRoles)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays = 7;
}

export class LinkExistingIdentityDto extends PersonVersionDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class InviteRelatedPersonDto extends PersonVersionDto {
  @IsIn(relationshipTypes)
  relationshipType!: (typeof relationshipTypes)[number];

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  givenName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  familyName!: string;

  @IsBoolean()
  canReceiveCommunications!: boolean;

  @IsBoolean()
  canAccessRecords!: boolean;

  @IsDateString()
  startsOn!: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays = 7;
}

export class ReconcilePeopleImportRowDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  givenName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  familyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsIn(["applicant", "active", "suspended", "withdrawn", "completed"])
  learnerStatus?: string;

  @IsOptional()
  @IsIn(["active", "leave", "suspended", "ended"])
  staffStatus?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class ResolvePeopleImportDuplicateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsIn(["link-existing", "create-new", "skip"])
  resolution!: "link-existing" | "create-new" | "skip";

  @IsOptional()
  @IsUUID()
  matchedPersonId?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CreateDataSubjectRequestDto {
  @IsIn(["access", "export"])
  requestType!: "access" | "export";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
