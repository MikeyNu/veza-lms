import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const keyPattern = /^[a-z][a-z0-9.-]{2,119}$/;
const providerPattern = /^[a-z][a-z0-9.-]{1,79}$/;

export class CreateNotificationTemplateDto {
  @Matches(keyPattern)
  templateKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  displayName!: string;

  @Matches(keyPattern)
  topicKey!: string;

  @IsIn(["required", "optional"])
  policy!: "required" | "optional";

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(["email", "sms", "push"], { each: true })
  defaultChannels!: ("email" | "sms" | "push")[];

  @IsOptional()
  @IsString()
  @MaxLength(320)
  subjectTemplate?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(262_144)
  bodyTemplate!: string;

  @IsIn(["text/plain", "text/html", "application/json"])
  contentType!: "text/plain" | "text/html" | "application/json";

  @IsObject()
  variableSchema!: Record<string, unknown>;
}

export class CreateNotificationTemplateVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  subjectTemplate?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(262_144)
  bodyTemplate!: string;

  @IsIn(["text/plain", "text/html", "application/json"])
  contentType!: "text/plain" | "text/html" | "application/json";

  @IsObject()
  variableSchema!: Record<string, unknown>;
}

export class VersionedDecisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ApproveNotificationTemplateDto extends VersionedDecisionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class ConfigureTenantSenderDto {
  @IsIn(["email", "sms", "push"])
  channel!: "email" | "sms" | "push";

  @Matches(providerPattern)
  providerKey!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(320)
  senderIdentity!: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @Matches(/^[A-Za-z0-9/_+=.@:-]{3,512}$/)
  secretReference!: string;

  @IsObject()
  configuration!: Record<string, unknown>;
}

export class VerifyTenantSenderDto extends VersionedDecisionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateNotificationPreferenceDto {
  @Matches(/^[a-z*][a-z0-9.*-]{0,119}$/)
  topicKey!: string;

  @IsIn(["email", "sms", "push"])
  channel!: "email" | "sms" | "push";

  @IsIn(["enabled", "disabled", "digest"])
  state!: "enabled" | "disabled" | "digest";

  @IsOptional()
  @IsIn(["daily", "weekly"])
  digestFrequency?: "daily" | "weekly";

  @IsObject()
  quietHours!: Record<string, unknown>;
}

export class QueueNotificationDto {
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @Matches(keyPattern)
  templateKey!: string;

  @Matches(keyPattern)
  topicKey!: string;

  @IsIn(["required", "optional"])
  policy!: "required" | "optional";

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(["email", "sms", "push"], { each: true })
  channels!: ("email" | "sms" | "push")[];

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsUUID()
  recipientPersonId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  pushToken?: string;

  @IsObject()
  variables!: Record<string, unknown>;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  deduplicationKey!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledAt?: string;
}

export class ProviderEventDto {
  @IsUUID()
  tenantId!: string;

  @Matches(providerPattern)
  providerKey!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(512)
  providerEventId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(512)
  providerMessageId!: string;

  @IsIn(["accepted", "delivered", "deferred", "bounce", "complaint", "failed", "opened", "clicked"])
  eventType!: "accepted" | "delivered" | "deferred" | "bounce" | "complaint" | "failed" | "opened" | "clicked";

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  recipientHash?: string;

  @IsObject()
  evidence!: Record<string, unknown>;

  @IsISO8601({ strict: true })
  occurredAt!: string;
}
