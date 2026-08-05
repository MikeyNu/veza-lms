import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";

export class LinkProgrammeCourseDto {
  @IsUUID() blueprintVersionId!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedProgrammeVersion!: number;
  @Type(() => Number) @IsInt() @Min(1) sequenceNumber!: number;
  @IsIn(["required", "elective", "optional"])
  requirementType!: "required" | "elective" | "optional";
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) creditContribution?: number;
}

export class AddCourseRequisiteDto {
  @IsUUID() requiredCourseDefinitionId!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedBlueprintVersion!: number;
  @IsIn(["prerequisite", "corequisite", "equivalent"])
  requisiteType!: "prerequisite" | "corequisite" | "equivalent";
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumResult?: number;
}

export class ChangeRunLifecycleDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["scheduled", "open", "in_progress", "completed", "cancelled"])
  lifecycle!: "scheduled" | "open" | "in_progress" | "completed" | "cancelled";
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class ChangeEnrolmentStatusDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["pending", "active", "waitlisted", "withdrawn", "completed", "cancelled"])
  status!: "pending" | "active" | "waitlisted" | "withdrawn" | "completed" | "cancelled";
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) completionResult?: number;
}

export class AllocateClassStaffDto {
  @IsUUID() personId!: string;
  @IsIn(["lead-instructor", "instructor", "assistant", "assessor"])
  allocationRole!: "lead-instructor" | "instructor" | "assistant" | "assessor";
  @IsDateString() validFrom!: string;
  @IsOptional() @IsDateString() validUntil?: string;
}
