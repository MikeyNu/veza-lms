import { Transform, Type, type TransformFnParams } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { TenantStatus } from "@veza/contracts";

const tenantStatuses: readonly TenantStatus[] = ["provisioning", "active", "suspended", "offboarding", "closed"];

function optionalString(value: unknown): unknown {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export class ListTenantsDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => optionalString(value))
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @IsIn(tenantStatuses)
  status?: TenantStatus;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => optionalString(value))
  @IsString()
  @MaxLength(80)
  planKey?: string;

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
  limit = 30;
}
