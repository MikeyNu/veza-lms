import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { TenantModuleKey } from "@veza/contracts";

const moduleKeys: readonly TenantModuleKey[] = [
  "core",
  "studio-pro",
  "exams",
  "commerce",
  "advanced-analytics",
  "credentials",
  "guardian-portal",
  "ai-assist",
  "integration-hub",
];

function trimmed(value: unknown): unknown {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

export class CreateFeatureFlagDto {
  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @Matches(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
  @MaxLength(120)
  key!: string;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(20)
  @MaxLength(1_000)
  description!: string;

  @IsIn(["low", "medium", "high", "critical"])
  riskLevel!: "low" | "medium" | "high" | "critical";

  @IsBoolean()
  defaultEnabled!: boolean;

  @IsOptional()
  @IsIn(moduleKeys)
  requiredModuleKey?: TenantModuleKey;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}

export class ChangeFeatureFlagLifecycleDto {
  @IsIn(["active", "retired"])
  lifecycle!: "active" | "retired";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}

export class ConfigureRingFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}

export class AssignTenantReleaseRingDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  ringKey!: string;

  @IsBoolean()
  isCanary!: boolean;

  @IsISO8601()
  effectiveFrom!: string;

  @IsOptional()
  @IsISO8601()
  effectiveUntil?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}

export class ConfigureTenantFlagDto {
  @IsIn(["enabled", "disabled", "inherit"])
  state!: "enabled" | "disabled" | "inherit";

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @Transform(({ value }: TransformFnParams) => trimmed(value))
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}
