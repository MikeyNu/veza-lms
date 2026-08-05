import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const canonicalKeys = [
  "learner",
  "staff",
  "guardian",
  "sponsor",
  "programme",
  "qualification",
  "learning-path",
  "subject",
  "module",
  "course",
  "grade",
  "year",
  "level",
  "cohort",
  "class",
  "academic-period",
  "outcome",
  "competency",
] as const;
const hierarchyTypes = [
  "programme",
  "qualification",
  "learning-path",
  "subject",
  "module",
  "course",
  "grade",
  "year",
  "level",
] as const;

export class TerminologyEntryDto {
  @IsIn(canonicalKeys)
  canonicalKey!: (typeof canonicalKeys)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  singularLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  pluralLabel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  helpText?: string;
}

export class ProgrammeHierarchyLevelDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  levelOrder!: number;

  @IsIn(hierarchyTypes)
  canonicalType!: (typeof hierarchyTypes)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  singularLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  pluralLabel!: string;

  @IsBoolean()
  isRequired!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumOccurrences!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maximumOccurrences?: number;
}

export class CreateTerminologyVersionDto {
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)
  locale!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => TerminologyEntryDto)
  entries!: TerminologyEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProgrammeHierarchyLevelDto)
  programmeHierarchy?: ProgrammeHierarchyLevelDto[];
}

export class SubmitTerminologyReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ApproveTerminologyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  approvalNotes!: string;
}
