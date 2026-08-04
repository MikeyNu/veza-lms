import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@veza/authz";

export const TENANT_PERMISSION_METADATA = "veza:tenant-permission";
export const RequiresTenantPermission = (permission: Permission) => SetMetadata(TENANT_PERMISSION_METADATA, permission);
