import { Transform, Type, type TransformFnParams } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

function optionalString(value: unknown): unknown {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export class ListDeadLetterEventsDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => optionalString(value))
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i)
  eventName?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => optionalString(value))
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  aggregateType?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => optionalString(value))
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
