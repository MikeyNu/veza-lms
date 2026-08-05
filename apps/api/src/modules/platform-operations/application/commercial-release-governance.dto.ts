import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
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
  ValidateNested,
} from "class-validator";

export class PlanModulePolicyDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,79}$/) moduleKey!: string;
  @IsIn(["enabled", "disabled", "trial"]) state!: "enabled" | "disabled" | "trial";
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsInt() @Min(0) @Max(365) trialDays!: number;
}

export class UpsertModuleCatalogueDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,79}$/) moduleKey!: string;
  @IsString() @MinLength(2) @MaxLength(120) displayName!: string;
  @IsString() @MinLength(20) @MaxLength(1000) description!: string;
  @IsIn(["core", "learning", "operations", "engagement", "analytics", "integration", "ai"])
  category!: "core" | "learning" | "operations" | "engagement" | "analytics" | "integration" | "ai";
  @IsIn(["draft", "active", "retired"]) status!: "draft" | "active" | "retired";
  @IsOptional() @IsObject() quotaSchema?: Record<string, unknown>;
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9.-]{2,119}$/) billingMetricKey?: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class CreatePlanPolicyDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,79}$/) planKey!: string;
  @IsString() @MinLength(2) @MaxLength(120) displayName!: string;
  @IsString() @MinLength(20) @MaxLength(2000) description!: string;
  @IsObject() limits!: Record<string, unknown>;
  @IsInt() @Min(0) @Max(365) defaultTrialDays!: number;
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsOptional() @IsString() @MaxLength(300) billingProductReference?: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50)
  @ValidateNested({ each: true }) @Type(() => PlanModulePolicyDto)
  modules!: PlanModulePolicyDto[];
}

export class TransitionPlanPolicyDto {
  @IsIn(["approve", "schedule", "activate", "retire", "cancel"])
  action!: "approve" | "schedule" | "activate" | "retire" | "cancel";
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class AssignTenantPlanDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,79}$/) planKey!: string;
  @IsUUID() policyVersionId!: string;
  @IsInt() @Min(1) expectedTenantVersion!: number;
  @IsISO8601() effectiveFrom!: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class CreateReleaseVersionDto {
  @IsString() @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) versionKey!: string;
  @IsString() @MinLength(3) @MaxLength(160) displayName!: string;
  @IsString() @MinLength(20) @MaxLength(10000) releaseNotes!: string;
  @IsOptional() @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) compatibilityFloor?: string;
  @IsInt() @Min(1) schemaVersion!: number;
  @IsString() @Matches(/^[a-z][a-z0-9._-]{2,159}$/) migrationBundleKey!: string;
  @IsIn(["pending", "running", "completed", "failed", "not-required"])
  migrationState!: "pending" | "running" | "completed" | "failed" | "not-required";
  @Matches(/^sha256:[a-f0-9]{64}$/) artifactDigest!: string;
  @Matches(/^[a-f0-9]{40}$/) sourceCommitSha!: string;
}

export class TransitionReleaseVersionDto {
  @IsIn(["candidate", "active", "retired", "rolled-back"])
  lifecycle!: "candidate" | "active" | "retired" | "rolled-back";
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class SetReleaseRingTargetDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) ringKey!: string;
  @IsString() @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) releaseVersion!: string;
  @IsNumber() @Min(0.01) @Max(100) rolloutPercent!: number;
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class TransitionReleaseRingTargetDto {
  @IsIn(["active", "paused", "completed", "rolled-back"])
  lifecycle!: "active" | "paused" | "completed" | "rolled-back";
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class SetTenantReleaseExceptionDto {
  @IsUUID() tenantId!: string;
  @IsOptional() @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) pinnedReleaseVersion?: string;
  @IsOptional() @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) excludedReleaseVersion?: string;
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class RecordReleaseCompatibilityDto {
  @IsUUID() tenantId!: string;
  @IsOptional() @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) currentReleaseVersion?: string;
  @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) targetReleaseVersion!: string;
  @IsBoolean() compatible!: boolean;
  @IsArray() @ArrayMaxSize(100) blockers!: unknown[];
  @IsArray() @ArrayMaxSize(100) warnings!: unknown[];
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
  @IsString() @MinLength(3) @MaxLength(160) checkedBy!: string;
}

export class UpdateTenantMigrationDto {
  @IsUUID() tenantId!: string;
  @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) targetReleaseVersion!: string;
  @IsIn(["pending", "running", "blocked", "completed", "failed", "rolled-back"])
  state!: "pending" | "running" | "blocked" | "completed" | "failed" | "rolled-back";
  @IsOptional() @IsString() @MaxLength(300) currentStep?: string;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) completedSteps!: string[];
  @IsOptional() @IsString() @MaxLength(2000) lastError?: string;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
  @IsString() @MinLength(3) @MaxLength(160) updatedBy!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}

export class CreateRollbackDecisionDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) ringKey?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) fromReleaseVersion!: string;
  @Matches(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/) toReleaseVersion!: string;
  @IsISO8601() effectiveAt!: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}
