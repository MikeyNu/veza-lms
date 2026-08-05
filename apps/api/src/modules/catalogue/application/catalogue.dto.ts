import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const codePattern = /^[A-Z0-9][A-Z0-9._-]{1,31}$/;
const deliveryModes = ["in_person", "online", "blended", "workplace"] as const;

export class CreateOutcomeDto {
  @Matches(codePattern) code!: string;
  @IsString() @MinLength(3) @MaxLength(180) title!: string;
  @IsString() @MinLength(10) @MaxLength(4000) description!: string;
  @IsIn(["knowledge", "skill", "competency", "graduate-attribute"])
  outcomeType!: "knowledge" | "skill" | "competency" | "graduate-attribute";
  @IsOptional() @IsString() @MaxLength(40) levelCode?: string;
}

export class CreateProgrammeDto {
  @Matches(codePattern) code!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(10) @MaxLength(8000) description!: string;
  @IsIn(["qualification", "learning-path", "short-course", "grade-band"])
  programmeType!: "qualification" | "learning-path" | "short-course" | "grade-band";
  @IsOptional() @IsUUID() organisationalUnitId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) creditValue?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) notionalHours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationValue?: number;
  @IsOptional() @IsIn(["days", "weeks", "months", "years"]) durationUnit?: string;
}

export class CreateBlueprintDto {
  @Matches(codePattern) code!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(10) @MaxLength(8000) description!: string;
  @IsOptional() @IsString() @MaxLength(120) subjectArea?: string;
  @IsOptional() @IsUUID() organisationalUnitId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) creditValue?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) notionalHours?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsIn(deliveryModes, { each: true })
  deliveryModes!: (typeof deliveryModes)[number][];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID("4", { each: true })
  outcomeIds!: string[];
}

export class ApproveCurriculumDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
  @IsString() @MinLength(20) @MaxLength(1000) approvalNotes!: string;
}

export class CreateRunDto {
  @IsUUID() academicPeriodId!: string;
  @IsUUID() blueprintVersionId!: string;
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsIn(deliveryModes) deliveryMode!: (typeof deliveryModes)[number];
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) capacity?: number;
}

export class CreateCohortDto {
  @IsString() @MinLength(2) @MaxLength(40) code!: string;
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsOptional() @IsDateString() startsOn?: string;
  @IsOptional() @IsDateString() endsOn?: string;
}

export class CreateClassDto {
  @IsUUID() courseRunId!: string;
  @IsOptional() @IsUUID() cohortId?: string;
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) capacity?: number;
}

export class CreateEnrolmentDto {
  @IsUUID() learnerPersonId!: string;
  @IsUUID() courseRunId!: string;
  @IsOptional() @IsUUID() classSectionId?: string;
  @IsOptional() @IsUUID() cohortId?: string;
  @IsDateString() enrolledOn!: string;
  @IsOptional() @IsIn(["pending", "active", "waitlisted"])
  status: "pending" | "active" | "waitlisted" = "active";
}

export class TransferEnrolmentDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsUUID() targetCourseRunId!: string;
  @IsOptional() @IsUUID() targetClassSectionId?: string;
  @IsOptional() @IsUUID() targetCohortId?: string;
  @IsString() @MinLength(20) @MaxLength(1000) reason!: string;
}
