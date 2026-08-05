import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class RecordCompletionEvidenceDto {
  @IsUUID() lessonId!: string;
  @IsIn([
    "viewed",
    "acknowledged",
    "activity-completed",
    "discussion-posted",
    "assignment-submitted",
    "manual-completion",
    "external-evidence",
  ])
  evidenceType!: string;
  @IsString() @MinLength(1) @MaxLength(200) evidenceKey!: string;
  @IsObject() evidence!: Record<string, unknown>;
}

export class CreateBookmarkDto {
  @IsUUID() lessonId!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) blockId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) note?: string;
}

export class CreateDiscussionPostDto {
  @IsUUID() discussionId!: string;
  @IsOptional() @IsUUID() parentPostId?: string;
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
}

export class CreateOfflineManifestDto {
  @IsOptional() @IsIn(["full", "low-bandwidth"])
  mode?: "full" | "low-bandwidth";
}

export class ApplyLearnerSyncOperationDto {
  @IsString() @MinLength(8) @MaxLength(200) deviceOperationId!: string;
  @IsIn(["bookmark", "completion", "discussion-post"])
  operationType!: "bookmark" | "completion" | "discussion-post";
  @IsObject() payload!: Record<string, unknown>;
}
