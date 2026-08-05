import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const eventNamePattern = /^[a-z][a-z0-9.-]{2,159}$/;
const keyPattern = /^[a-z][a-z0-9.-]{2,119}$/;

export class CreateEventSchemaDto {
  @Matches(eventNamePattern)
  eventName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  majorVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  minorVersion!: number;

  @Matches(/^[a-z][a-z0-9-]{1,79}$/)
  ownerContext!: string;

  @IsIn(["public", "internal", "confidential", "restricted"])
  classification!: "public" | "internal" | "confidential" | "restricted";

  @IsIn(["additive", "backward", "strict"])
  compatibility!: "additive" | "backward" | "strict";

  @IsObject()
  payloadSchema!: Record<string, unknown>;
}

export class SubmitEventSchemaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ApproveEventSchemaDto extends SubmitEventSchemaDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CreateEventConsumerDto {
  @Matches(keyPattern)
  consumerKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  displayName!: string;

  @Matches(keyPattern)
  handlerKey!: string;

  @IsIn(["internal", "sqs", "webhook", "search", "notification", "media"])
  destinationType!: "internal" | "sqs" | "webhook" | "search" | "notification" | "media";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maximumAttempts!: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(3600)
  leaseSeconds!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  subscriptions!: EventSubscriptionInput[];
}

export class EventSubscriptionInput {
  @Matches(/^[a-z*][a-z0-9.*-]{0,159}$/)
  eventPattern!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  minimumMajorVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  maximumMajorVersion!: number;
}

export class UpdateConsumerStatusDto {
  @IsIn(["active", "paused", "retired"])
  status!: "active" | "paused" | "retired";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class ReplayEventDto {
  @IsOptional()
  @Matches(keyPattern)
  consumerKey?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CreateScheduledJobDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i)
  tenantId?: string;

  @Matches(keyPattern)
  jobKey!: string;

  @Matches(keyPattern)
  handlerKey!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(2_592_000)
  intervalSeconds?: number;

  @IsString()
  @MinLength(20)
  @MaxLength(40)
  nextRunAt!: string;
}
