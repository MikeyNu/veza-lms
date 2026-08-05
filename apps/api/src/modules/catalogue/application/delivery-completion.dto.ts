import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateOfferingDto {
  @IsUUID() courseRunId!: string;
  @IsString() @MinLength(2) @MaxLength(48) code!: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsIn(["managed", "self-service", "invitation-only"])
  registrationMode!: "managed" | "self-service" | "invitation-only";
  @IsOptional() @IsDateString() opensAt?: string;
  @IsOptional() @IsDateString() closesAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) capacityOverride?: number;
  @Type(() => Boolean) @IsBoolean() waitlistEnabled!: boolean;
}

export class ChangeOfferingStatusDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["open", "closed", "completed", "cancelled"])
  status!: "open" | "closed" | "completed" | "cancelled";
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class UpsertRunOverlayDto {
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
  @IsObject() overlay!: Record<string, unknown>;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class CreateTimetableSlotDto {
  @IsUUID() courseRunId!: string;
  @IsOptional() @IsUUID() classSectionId?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsString() @MinLength(3) @MaxLength(80) timezone!: string;
  @IsIn(["in_person", "online", "blended", "workplace"])
  deliveryMode!: "in_person" | "online" | "blended" | "workplace";
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) roomKey?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) locationLabel?: string;
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) onlineJoinUrl?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) recurrenceKey?: string;
}

export class PromoteWaitlistEntryDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsUUID() classSectionId?: string;
  @IsOptional() @IsUUID() cohortId?: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}

export class ReinstateEnrolmentDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsUUID() offeringId?: string;
  @IsOptional() @IsUUID() classSectionId?: string;
  @IsOptional() @IsUUID() cohortId?: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}
