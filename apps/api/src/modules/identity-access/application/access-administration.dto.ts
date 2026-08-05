import { Transform, Type, type TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { BaselineRoleKey, MembershipStatus } from "@veza/contracts";

export const accessRoles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "auditor",
];
export const accessScopeTypes = ["tenant", "institution"] as const;

function optionalString(value: unknown): unknown {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export class ListAccessDirectoryDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => optionalString(value))
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @IsIn(["invited", "active", "suspended", "expired", "revoked"] satisfies readonly MembershipStatus[])
  status?: MembershipStatus;

  @IsOptional()
  @IsIn(accessRoles)
  roleKey?: BaselineRoleKey;

  @IsOptional()
  @IsUUID()
  institutionId?: string;

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

export class CreateAccessInvitationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(accessRoles)
  roleKey!: BaselineRoleKey;

  @IsIn(accessScopeTypes)
  scopeType!: (typeof accessScopeTypes)[number];

  @IsUUID()
  scopeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays = 7;
}

export class AssignRoleDto {
  @IsIn(accessRoles)
  roleKey!: BaselineRoleKey;

  @IsIn(accessScopeTypes)
  scopeType!: (typeof accessScopeTypes)[number];

  @IsUUID()
  scopeId!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  validUntil?: string;
}

export class EndRoleAssignmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ChangeMembershipStatusDto {
  @IsIn(["active", "suspended", "revoked"])
  status!: Extract<MembershipStatus, "active" | "suspended" | "revoked">;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RevokeInvitationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
