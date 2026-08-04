import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

function normalizeOptionalString(value: unknown): unknown {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export class ListAuditEventsDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i)
  eventType?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  resourceType?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(180)
  resourceId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => normalizeOptionalString(value))
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
