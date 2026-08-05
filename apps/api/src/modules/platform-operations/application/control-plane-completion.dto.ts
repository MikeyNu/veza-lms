import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
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

const deploymentTiers = ["shared", "protected", "sovereign"] as const;
const brandingStatuses = ["not-configured", "draft", "verified", "action-required"] as const;
const identityStatuses = ["not-configured", "pending", "verified", "degraded", "action-required"] as const;
const lifecycleActions = ["activate", "suspend", "resume", "start-offboarding", "close"] as const;
const entitlementStates = ["enabled", "disabled", "trial"] as const;
const enforcementModes = ["notify", "soft-deny", "hard-deny"] as const;
const supportSeverities = ["normal", "high", "security-incident"] as const;
const incidentSeverities = ["low", "medium", "high", "critical"] as const;

export class SupportContactDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MinLength(2) @MaxLength(120) role!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsBoolean() primary!: boolean;
}

export class UpdateTenantOperationsDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsEnum(deploymentTiers) deploymentTier?: typeof deploymentTiers[number];
  @IsOptional() @IsString() @Matches(/^[a-z]{2}(?:-[a-z]+)?-[0-9]$/) residencyRegion?: string;
  @IsOptional() @IsString() @Matches(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/) customDomain?: string;
  @IsOptional() @IsEnum(brandingStatuses) brandingStatus?: typeof brandingStatuses[number];
  @IsOptional() @IsEnum(identityStatuses) identityProviderStatus?: typeof identityStatuses[number];
  @IsOptional() @IsObject() quotaPolicy?: Record<string, unknown>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SupportContactDto)
  @ArrayMaxSize(20) supportContacts?: SupportContactDto[];
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class ChangeTenantLifecycleDto {
  @IsEnum(lifecycleActions) action!: typeof lifecycleActions[number];
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class RequestTenantExportDto {
  @IsEnum(["full-tenant", "audit", "identity", "learning-records", "media-manifest"] as const)
  exportType!: "full-tenant" | "audit" | "identity" | "learning-records" | "media-manifest";
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class CompleteTenantExportDto {
  @IsString() @MinLength(3) @MaxLength(1000) storageReference!: string;
  @Matches(/^[a-f0-9]{64}$/) checksumSha256!: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateRetentionHoldDto {
  @IsEnum(["legal", "security", "customer-request", "regulatory", "billing-dispute"] as const)
  holdType!: "legal" | "security" | "customer-request" | "regulatory" | "billing-dispute";
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
  @IsOptional() @IsString() @MaxLength(300) reference?: string;
  @IsOptional() @IsISO8601() expiresAt?: string;
}

export class ReleaseRetentionHoldDto {
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class ScheduleTenantDeletionDto {
  @IsUUID() exportReceiptId!: string;
  @IsISO8601() scheduledFor!: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class CancelTenantDeletionDto {
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class SetEntitlementOverrideDto {
  @IsString() @Matches(/^[a-z][a-z0-9-]{2,79}$/) moduleKey!: string;
  @IsEnum(entitlementStates) state!: typeof entitlementStates[number];
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
  @IsOptional() @IsString() @MaxLength(300) billingReference?: string;
}

export class SetUsageThresholdDto {
  @IsString() @Matches(/^[a-z][a-z0-9.-]{2,119}$/) metricKey!: string;
  @IsNumber() @Min(0) warningValue!: number;
  @IsNumber() @Min(0) criticalValue!: number;
  @IsEnum(enforcementModes) enforcement!: typeof enforcementModes[number];
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class SetBillingLinkDto {
  @IsString() @Matches(/^[a-z][a-z0-9.-]{2,79}$/) providerKey!: string;
  @IsString() @MinLength(2) @MaxLength(300) externalCustomerReference!: string;
  @IsOptional() @IsString() @MaxLength(300) externalSubscriptionReference?: string;
  @IsEnum(["linked", "trial", "past-due", "suspended", "cancelled"] as const)
  billingState!: "linked" | "trial" | "past-due" | "suspended" | "cancelled";
  @IsISO8601() effectiveFrom!: string;
  @IsOptional() @IsISO8601() effectiveUntil?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class CreateSupportCaseDto {
  @IsUUID() tenantId!: string;
  @IsString() @MinLength(5) @MaxLength(200) title!: string;
  @IsString() @MinLength(10) @MaxLength(2000) purpose!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) requestedScope!: string[];
  @IsEnum(supportSeverities) severity!: typeof supportSeverities[number];
  @IsObject() customerContact!: Record<string, unknown>;
}

export class RecordCustomerApprovalDto {
  @IsEnum(["approved", "rejected", "revoked"] as const) decision!: "approved" | "rejected" | "revoked";
  @IsString() @MinLength(2) @MaxLength(160) customerApproverName!: string;
  @IsEmail() customerApproverEmail!: string;
  @IsString() @MinLength(3) @MaxLength(300) approvalReference!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) approvedScope!: string[];
  @IsISO8601() expiresAt!: string;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}

export class StartSupportElevationDto {
  @IsUUID() approvalId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) grantedScope!: string[];
  @IsInt() @Min(5) @Max(480) durationMinutes!: number;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class TerminateSupportSessionDto {
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}

export class ResolveSupportCaseDto {
  @IsString() @MinLength(10) @MaxLength(2000) resolution!: string;
}

export class RecordSecurityIncidentDto {
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() supportCaseId?: string;
  @IsEnum(incidentSeverities) severity!: typeof incidentSeverities[number];
  @IsString() @MinLength(3) @MaxLength(120) category!: string;
  @IsString() @MinLength(10) @MaxLength(2000) summary!: string;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}
