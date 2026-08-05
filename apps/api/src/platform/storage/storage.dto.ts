import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
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

export class CreateStorageNamespaceDto {
  @Matches(/^[a-z][a-z0-9-]{1,79}$/)
  namespaceKey!: string;

  @Matches(/^[a-z0-9][a-z0-9.-]{1,62}$/)
  bucketKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  residencyRegion!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(512)
  kmsKeyReference!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  cdnDomain?: string;
}

export class CreateStoragePolicyDto {
  @Matches(/^[a-z][a-z0-9.-]{2,119}$/)
  policyKey!: string;

  @Matches(/^[a-z][a-z0-9.-]{2,119}$/)
  purpose!: string;

  @IsString({ each: true })
  allowedMediaTypes!: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(107_374_182_400)
  maximumBytes!: number;

  @IsBoolean()
  requireChecksum!: boolean;

  @IsBoolean()
  requireMalwareScan!: boolean;

  @IsBoolean()
  requireAccessibilityEvidence!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36_500)
  retentionDays?: number;

  @IsBoolean()
  legalHoldCapable!: boolean;

  @IsObject()
  processingProfile!: Record<string, unknown>;
}

export class UpdateStorageQuotaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9_007_199_254_740_991)
  maximumStoredBytes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9_007_199_254_740_991)
  maximumMonthlyEgressBytes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  maximumMonthlyTranscodeSeconds!: number;

  @IsIn(["observe", "soft", "hard"])
  enforcement!: "observe" | "soft" | "hard";

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Max(1)
  warningThreshold!: number;
}

export class CreateMediaUploadDto {
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @IsUUID()
  namespaceId!: string;

  @IsUUID()
  storagePolicyId!: string;

  @Matches(/^[a-z][a-z0-9.-]{2,119}$/)
  purpose!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFilename!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  mediaType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(107_374_182_400)
  byteSize!: number;

  @Matches(/^[a-f0-9]{64}$/)
  checksumSha256!: string;

  @IsObject()
  metadata!: Record<string, unknown>;
}

export class CompleteMediaUploadDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  acknowledgedBytes!: number;

  @Matches(/^[a-f0-9]{64}$/)
  checksumSha256!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class RecordMediaAccessibilityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  altText?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1_048_576)
  transcript?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  caption?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CreateRecordingConsentDto {
  @IsUUID()
  institutionId!: string;

  @IsUUID()
  subjectPersonId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  recordingContext!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  purpose!: string;

  @IsIn(["granted", "declined"])
  state!: "granted" | "declined";

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @IsObject()
  evidence!: Record<string, unknown>;
}

export class WithdrawRecordingConsentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class RequestMediaDeletionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  executeAfter?: string;
}

export class ApproveMediaDeletionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
