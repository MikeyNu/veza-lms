import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateServiceAccountDto {
  @IsUUID()
  principalUserId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  displayName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  allowedIpCidrs?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  tokenTtlSeconds!: number;
}

export class RotateServiceAccountSecretDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateServiceAccountStatusDto {
  @IsIn(["active", "suspended", "retired"])
  status!: "active" | "suspended" | "retired";

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class ClientCredentialsTokenDto {
  @IsIn(["client_credentials"])
  grant_type!: "client_credentials";

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  client_secret?: string;

  @IsOptional()
  @IsString()
  scope?: string;
}
