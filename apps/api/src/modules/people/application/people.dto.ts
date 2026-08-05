import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

const statuses = ["active", "inactive", "deceased"] as const;
const learnerStatuses = ["applicant", "active", "suspended", "withdrawn", "completed"] as const;
const staffStatuses = ["active", "leave", "suspended", "ended"] as const;
const relationshipTypes = ["guardian", "sponsor", "employer", "advisor", "authorised-contact"] as const;

export class ListPeopleDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(statuses) status?: typeof statuses[number];
  @IsOptional() @IsBoolean() @Type(() => Boolean) learnersOnly?: boolean;
  @IsOptional() @IsBoolean() @Type(() => Boolean) staffOnly?: boolean;
  @IsOptional() @IsString() @MaxLength(512) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class CreateContactDto {
  @IsIn(["email", "phone"]) type!: "email" | "phone";
  @IsString() @MinLength(3) @MaxLength(320) value!: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsBoolean() isPrimary!: boolean;
}

export class CreatePersonDto {
  @IsString() @MinLength(1) @MaxLength(120) givenName!: string;
  @IsOptional() @IsString() @MaxLength(160) middleNames?: string;
  @IsString() @MinLength(1) @MaxLength(120) familyName!: string;
  @IsOptional() @IsString() @MaxLength(120) preferredName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/) locale?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsIn(statuses) status: typeof statuses[number] = "active";
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateContactDto) contacts?: CreateContactDto[];
}

export class UpdatePersonDto extends CreatePersonDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class UpsertLearnerProfileDto {
  @Type(() => Number) @IsInt() @Min(1) expectedPersonVersion!: number;
  @IsIn(learnerStatuses) status!: typeof learnerStatuses[number];
  @IsOptional() @IsDateString() admissionDate?: string;
  @IsOptional() @IsDateString() completionDate?: string;
}

export class UpsertStaffProfileDto {
  @Type(() => Number) @IsInt() @Min(1) expectedPersonVersion!: number;
  @IsIn(staffStatuses) status!: typeof staffStatuses[number];
  @IsOptional() @IsString() @MaxLength(80) employeeNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) engagementType?: string;
}

export class CreateRelationshipDto {
  @IsUUID() relatedPersonId!: string;
  @IsIn(relationshipTypes) type!: typeof relationshipTypes[number];
  @IsDateString() startsOn!: string;
  @IsOptional() @IsDateString() endsOn?: string;
  @IsBoolean() canReceiveCommunications!: boolean;
  @IsBoolean() canAccessRecords!: boolean;
}

export class ChangeRelationshipStateDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(20) @MaxLength(500) reason!: string;
}

export class DuplicateDecisionDto {
  @IsIn(["confirmed-duplicate", "not-duplicate"]) decision!: "confirmed-duplicate" | "not-duplicate";
  @IsString() @MinLength(20) @MaxLength(500) reason!: string;
}

export class MergePeopleDto {
  @IsUUID() sourcePersonId!: string;
  @IsUUID() targetPersonId!: string;
  @Type(() => Number) @IsInt() @Min(1) sourceExpectedVersion!: number;
  @Type(() => Number) @IsInt() @Min(1) targetExpectedVersion!: number;
  @IsString() @MinLength(20) @MaxLength(500) reason!: string;
}

export class ReverseMergeDto {
  @IsString() @MinLength(20) @MaxLength(500) reason!: string;
}

export class StagePeopleImportDto {
  @IsUUID() institutionId!: string;
  @IsString() @MinLength(1) @MaxLength(240) filename!: string;
  @IsString() @MinLength(1) @MaxLength(2_000_000) csv!: string;
}

export class CommitPeopleImportDto {
  @IsString() @MinLength(20) @MaxLength(500) reason!: string;
}
