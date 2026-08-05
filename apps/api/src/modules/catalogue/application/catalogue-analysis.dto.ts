import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class SubmitCurriculumReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AddProgrammeOutcomeRequirementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedProgrammeVersion!: number;

  @IsUUID()
  learningOutcomeId!: string;

  @IsIn(["introduced", "developed", "mastered", "assessed"])
  minimumCoverageLevel!: "introduced" | "developed" | "mastered" | "assessed";
}

export class CreateCurriculumValidationPolicyDto {
  @IsBoolean()
  creditRequired!: boolean;

  @IsBoolean()
  notionalHoursRequired!: boolean;

  @IsBoolean()
  durationRequired!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  hoursPerCredit?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  ratioTolerancePercent = 10;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumCredit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  maximumCredit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumNotionalHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maximumNotionalHours?: number;
}

export class ApproveCurriculumValidationPolicyDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason!: string;
}
