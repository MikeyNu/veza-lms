import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateNested,
} from "class-validator";

export class StudioBlockDto {
  @IsString() @MinLength(1) @MaxLength(160) id!: string;
  @IsIn([
    "heading",
    "paragraph",
    "callout",
    "quote",
    "image",
    "video",
    "audio",
    "file",
    "embed",
    "table",
    "columns",
    "accordion",
    "tabs",
    "divider",
    "code",
    "equation",
    "quiz",
    "activity",
    "outcome",
  ])
  type!: string;
  @IsObject() data!: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => StudioBlockDto)
  children?: StudioBlockDto[];
}

export class CreateCourseSpaceDto {
  @IsUUID() blueprintVersionId!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
}

export class CreateStudioModuleDto {
  @IsUUID() courseSpaceId!: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(4000) description?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) sequenceNumber!: number;
  @IsOptional() @IsObject() availabilityRule?: Record<string, unknown>;
  @IsOptional() @IsObject() completionRule?: Record<string, unknown>;
}

export class CreateStudioLessonDto {
  @IsUUID() courseSpaceId!: string;
  @IsUUID() moduleId!: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(2000) summary?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) sequenceNumber!: number;
  @IsIn(["lesson", "resource", "activity", "discussion", "assignment-link"])
  lessonType!: "lesson" | "resource" | "activity" | "discussion" | "assignment-link";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) estimatedMinutes?: number;
  @IsOptional() @IsObject() availabilityRule?: Record<string, unknown>;
  @IsOptional() @IsObject() completionRule?: Record<string, unknown>;
}

export class SaveStudioRevisionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedLessonVersion!: number;
  @IsOptional() @IsUUID() basedOnRevisionId?: string;
  @IsArray() @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => StudioBlockDto)
  blocks!: StudioBlockDto[];
  @IsString() @MinLength(10) @MaxLength(2000) changeSummary!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID(undefined, { each: true })
  outcomeIds?: string[];
}

export class CreateReusableBlockDto {
  @IsString() @MinLength(3) @MaxLength(160) name!: string;
  @IsIn([
    "heading",
    "paragraph",
    "callout",
    "quote",
    "image",
    "video",
    "audio",
    "file",
    "embed",
    "table",
    "columns",
    "accordion",
    "tabs",
    "divider",
    "code",
    "equation",
    "quiz",
    "activity",
    "outcome",
  ])
  blockType!: string;
  @IsObject() content!: Record<string, unknown>;
}

export class CreateStudioCommentDto {
  @IsUUID() revisionId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) blockId?: string;
  @IsOptional() @IsUUID() parentCommentId?: string;
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}

export class ResolveStudioCommentDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["resolved", "reopened"])
  status!: "resolved" | "reopened";
}

export class RequestStudioReviewDto {
  @IsUUID() revisionId!: string;
}

export class DecideStudioReviewDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["approved", "changes-requested"])
  decision!: "approved" | "changes-requested";
  @IsString() @MinLength(10) @MaxLength(2000) notes!: string;
}

export class PublishCourseSpaceDto {
  @Type(() => Number) @IsInt() @Min(1) expectedCourseSpaceVersion!: number;
  @IsUUID() sourceReviewId!: string;
  @IsOptional() @IsUUID() rollbackOfSnapshotId?: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class AnalyseCourseImportDto {
  @IsIn(["common-cartridge", "canvas", "moodle", "scorm", "veza-json"])
  sourceFormat!: "common-cartridge" | "canvas" | "moodle" | "scorm" | "veza-json";
  @IsString() @MinLength(64) @MaxLength(64) sourceChecksum!: string;
  @IsObject() manifest!: Record<string, unknown>;
  @IsOptional() @IsUUID() courseSpaceId?: string;
}
