import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const keyPattern = /^[a-z][a-z0-9.-]{2,119}$/;

export class CreateSloDefinitionDto {
  @Matches(keyPattern)
  serviceName!: string;

  @Matches(keyPattern)
  sloKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  displayName!: string;

  @IsIn(["availability", "latency", "freshness", "delivery"])
  indicatorType!: "availability" | "latency" | "freshness" | "delivery";

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1)
  objective!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  windowDays!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300_000)
  latencyThresholdMs?: number;

  @IsObject()
  queryDefinition!: Record<string, unknown>;
}

export class UpdateSloStatusDto {
  @IsIn(["active", "retired"])
  status!: "active" | "retired";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CreateAlertRuleDto {
  @Matches(keyPattern)
  alertKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  displayName!: string;

  @IsIn(["info", "warning", "critical"])
  severity!: "info" | "warning" | "critical";

  @IsIn(["threshold", "absence", "burn-rate", "dependency"])
  conditionType!: "threshold" | "absence" | "burn-rate" | "dependency";

  @IsObject()
  condition!: Record<string, unknown>;

  @Matches(keyPattern)
  notificationTopic!: string;
}

export class UpdateAlertRuleStatusDto {
  @IsIn(["active", "paused", "retired"])
  status!: "active" | "paused" | "retired";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateAlertEventStateDto {
  @IsIn(["acknowledged", "resolved"])
  state!: "acknowledged" | "resolved";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateErrorReportStateDto {
  @IsIn(["acknowledged", "resolved", "ignored"])
  state!: "acknowledged" | "resolved" | "ignored";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateRuntimeStatusDto {
  @IsIn(["degraded", "stopping"])
  status!: "degraded" | "stopping";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
