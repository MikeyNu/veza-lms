import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import type { DeploymentTier, TenantModuleKey } from "@veza/contracts";

const deploymentTiers: readonly DeploymentTier[] = ["shared", "protected", "sovereign"];
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

export class ProvisionTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string;

  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/)
  slug!: string;

  @IsIn(deploymentTiers)
  deploymentTier!: DeploymentTier;

  @IsString()
  @Matches(/^[a-z]{2}-[a-z]+-\d$/)
  residencyRegion!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/)
  planKey!: string;

  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  locale!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  timezone!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(moduleKeys, { each: true })
  modules!: TenantModuleKey[];

  @IsEmail()
  ownerEmail!: string;
}
