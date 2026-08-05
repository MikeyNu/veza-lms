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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type {
  AcademicPeriodType,
  CampusDeliveryMode,
  InstitutionType,
  InstitutionalPolicyKey,
  OrganisationalUnitType,
} from "@veza/contracts";

const codePattern = /^[A-Z0-9](?:[A-Z0-9._-]{0,30}[A-Z0-9])?$/i;
const localePattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const institutionTypes: readonly InstitutionType[] = [
  "school", "college", "university", "training-provider", "corporate-academy", "other",
];
const deliveryModes: readonly CampusDeliveryMode[] = ["physical", "virtual", "hybrid"];
const unitTypes: readonly OrganisationalUnitType[] = [
  "faculty", "school", "department", "division", "centre", "programme-office", "other",
];
const periodTypes: readonly AcademicPeriodType[] = [
  "academic-year", "semester", "trimester", "term", "quarter", "block", "custom",
];
const policyKeys: readonly InstitutionalPolicyKey[] = [
  "privacy", "data-retention", "acceptable-use", "academic-integrity", "assessment",
  "attendance", "safeguarding", "support-escalation", "communications",
];

export class ConfigureTenantSetupProfileDto {
  @IsIn(["managed", "sso", "hybrid"])
  identityMode!: "managed" | "sso" | "hybrid";

  @IsEmail()
  supportEmail!: string;

  @IsEmail()
  privacyContactEmail!: string;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(3650)
  dataRetentionDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  learnerSupportSlaHours!: number;
}

export class CreateInstitutionDto {
  @IsString()
  @Matches(codePattern)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  legalName?: string;

  @IsIn(institutionTypes)
  institutionType!: InstitutionType;

  @IsString()
  @Matches(localePattern)
  locale!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  timezone!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class CreateCampusDto {
  @IsString()
  @Matches(codePattern)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsIn(deliveryModes)
  deliveryMode!: CampusDeliveryMode;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  timezone!: string;

  @IsBoolean()
  isPrimary!: boolean;

  @IsOptional()
  @IsObject()
  address?: Record<string, string>;
}

export class CreateOrganisationalUnitDto {
  @IsString()
  @Matches(codePattern)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsIn(unitTypes)
  unitType!: OrganisationalUnitType;

  @IsOptional()
  @IsUUID()
  parentUnitId?: string;
}

export class CreateAcademicPeriodDto {
  @IsString()
  @Matches(codePattern)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsIn(periodTypes)
  periodType!: AcademicPeriodType;

  @IsOptional()
  @IsUUID()
  parentPeriodId?: string;

  @IsDateString({ strict: true })
  startsOn!: string;

  @IsDateString({ strict: true })
  endsOn!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  teachingStartsOn?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  teachingEndsOn?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  enrolmentOpensAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  enrolmentClosesAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  resultsReleaseAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  timezone!: string;
}

export class ApproveInstitutionalPolicyDto {
  @IsIn(policyKeys)
  policyKey!: InstitutionalPolicyKey;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsObject()
  content!: Readonly<Record<string, unknown>>;

  @IsDateString({ strict: true })
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  effectiveUntil?: string;
}
