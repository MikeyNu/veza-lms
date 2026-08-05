import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateAssignmentDto {
  @IsUUID() courseRunId!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsObject() instructions!: Record<string, unknown>;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsObject() latePolicy!: Record<string, unknown>;
  @IsIn(["individual", "group"]) groupMode!: "individual" | "group";
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) allowedFormats!: string[];
  @Type(() => Number) @IsInt() @Min(1) @Max(100) maxAttempts!: number;
}

export class PublishAssignmentDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class AddAccommodationDto {
  @IsUUID() learnerPersonId!: string;
  @IsOptional() @IsDateString() dueAtOverride?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) extraAttempts!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) formatOverrides?: string[];
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class StartSubmissionDto {
  @IsUUID() assignmentId!: string;
  @IsUUID() enrolmentId!: string;
  @IsOptional() @IsUUID() supersedesAttemptId?: string;
}

export class RegisterSubmissionFileDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName!: string;
  @IsString() @MinLength(3) @MaxLength(1024) objectKey!: string;
  @IsString() @MinLength(3) @MaxLength(160) mediaType!: string;
  @Type(() => Number) @IsInt() @Min(1) byteSize!: number;
  @Matches(/^[a-f0-9]{64}$/) checksum!: string;
  @IsString() @MinLength(8) @MaxLength(160) uploadSessionId!: string;
  @Type(() => Number) @IsInt() @Min(0) uploadOffset!: number;
}

export class UpdateUploadOffsetDto {
  @IsString() @MinLength(8) @MaxLength(160) uploadSessionId!: string;
  @Type(() => Number) @IsInt() @Min(0) uploadOffset!: number;
}

export class RecordScanDto {
  @IsIn(["clean", "infected", "failed"]) scanStatus!: "clean" | "infected" | "failed";
  @IsObject() scanEvidence!: Record<string, unknown>;
}

export class FinalizeSubmissionDto {
  @IsObject() contentSnapshot!: Record<string, unknown>;
}

export class AllocateMarkerDto {
  @IsUUID() markerPersonId!: string;
  @IsIn(["primary", "second", "moderator"]) allocationRole!: "primary" | "second" | "moderator";
}

export class RecordMarkDto {
  @IsUUID() markerAllocationId!: string;
  @Type(() => Number) @IsNumber() @Min(0) score!: number;
  @IsObject() rubricScores!: Record<string, unknown>;
  @IsObject() feedback!: Record<string, unknown>;
  @IsIn(["draft", "submitted", "moderated"]) status!: "draft" | "submitted" | "moderated";
  @IsOptional() @IsUUID() supersedesMarkId?: string;
}

export class CreateGradeCategoryDto {
  @IsUUID() courseRunId!: string;
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) weight!: number;
  @Type(() => Number) @IsInt() @Min(1) sequenceNumber!: number;
}

export class CreateGradeItemDto {
  @IsUUID() courseRunId!: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() assignmentId?: string;
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) maximumScore!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) weight?: number;
  @IsIn(["zero", "ignore", "incomplete"]) missingPolicy!: "zero" | "ignore" | "incomplete";
  @IsIn(["half_up", "half_even", "floor", "ceiling", "truncate"]) roundingMode!: "half_up" | "half_even" | "floor" | "ceiling" | "truncate";
  @Type(() => Number) @IsInt() @Min(0) @Max(6) decimalPlaces!: number;
}

export class CreateFormulaVersionDto {
  @IsUUID() courseRunId!: string;
  @IsObject() formula!: Record<string, unknown>;
}

export class ActivateFormulaDto {
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class OverrideGradeDto {
  @IsUUID() enrolmentId!: string;
  @IsUUID() gradebookItemId!: string;
  @Type(() => Number) @IsNumber() score!: number;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class PublishGradeDto {
  @IsUUID() resultId!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class CreateCertificateTemplateDto {
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsObject() documentSchema!: Record<string, unknown>;
}

export class CreateAwardRuleDto {
  @IsUUID() templateId!: string;
  @IsOptional() @IsUUID() programmeId?: string;
  @IsOptional() @IsUUID() courseDefinitionId?: string;
  @IsObject() ruleSchema!: Record<string, unknown>;
}

export class IssueCertificateDto {
  @IsUUID() learnerPersonId!: string;
  @IsOptional() @IsUUID() enrolmentId?: string;
  @IsUUID() awardRuleId!: string;
}

export class RevokeCertificateDto {
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class RequestExportDto {
  @IsIn(["transcript", "gradebook", "enrolments", "people", "analytics"])
  exportType!: "transcript" | "gradebook" | "enrolments" | "people" | "analytics";
  @IsIn(["csv", "json"]) format!: "csv" | "json";
  @IsObject() filters!: Record<string, unknown>;
}

export class CompleteExportDto {
  @IsString() @MinLength(3) @MaxLength(1024) objectKey!: string;
  @Matches(/^[a-f0-9]{64}$/) checksum!: string;
  @Type(() => Number) @IsInt() @Min(0) rowCount!: number;
  @IsDateString() expiresAt!: string;
}
