export type Permission =
  | "tenant:read"
  | "tenant:configure"
  | "tenant:activate"
  | "institution:create"
  | "institution:configure"
  | "campus:manage"
  | "organisational-unit:manage"
  | "academic-period:manage"
  | "institutional-policy:approve"
  | "membership:read"
  | "membership:manage"
  | "role-assignment:read"
  | "role-assignment:manage"
  | "audit:read"
  | "people:read"
  | "people:create"
  | "people:update"
  | "people:merge"
  | "learner:read"
  | "learner:manage"
  | "staff:read"
  | "staff:manage"
  | "relationship:read"
  | "relationship:manage"
  | "people-import:manage";

export const permissions = {
  tenantRead: "tenant:read",
  tenantConfigure: "tenant:configure",
  tenantActivate: "tenant:activate",
  institutionCreate: "institution:create",
  institutionConfigure: "institution:configure",
  campusManage: "campus:manage",
  organisationalUnitManage: "organisational-unit:manage",
  academicPeriodManage: "academic-period:manage",
  institutionalPolicyApprove: "institutional-policy:approve",
  membershipRead: "membership:read",
  membershipManage: "membership:manage",
  roleAssignmentRead: "role-assignment:read",
  roleAssignmentManage: "role-assignment:manage",
  auditRead: "audit:read",
  peopleRead: "people:read",
  peopleCreate: "people:create",
  peopleUpdate: "people:update",
  peopleMerge: "people:merge",
  learnerRead: "learner:read",
  learnerManage: "learner:manage",
  staffRead: "staff:read",
  staffManage: "staff:manage",
  relationshipRead: "relationship:read",
  relationshipManage: "relationship:manage",
  peopleImportManage: "people-import:manage",
} as const satisfies Record<string, Permission>;

export type ResourceScopeType =
  | "tenant"
  | "institution"
  | "campus"
  | "organisational-unit"
  | "person";

export interface ResourceScope {
  readonly type: ResourceScopeType;
  readonly id: string;
  readonly ancestors?: readonly ResourceScope[];
}

export interface PermissionGrant {
  readonly permission: Permission;
  readonly resource: ResourceScope;
}

export interface AuthorizationSubject {
  readonly grants: readonly PermissionGrant[];
}

function resourceMatches(grant: ResourceScope, target: ResourceScope): boolean {
  if (grant.type === target.type && grant.id === target.id) return true;
  return target.ancestors?.some((ancestor) => resourceMatches(grant, ancestor)) ?? false;
}

export function hasPermission(
  subject: AuthorizationSubject,
  permission: Permission,
  resource: ResourceScope,
): boolean {
  return subject.grants.some(
    (grant) => grant.permission === permission && resourceMatches(grant.resource, resource),
  );
}

export const tenantOwnerPermissions: readonly Permission[] = Object.freeze([
  permissions.tenantRead,
  permissions.tenantConfigure,
  permissions.tenantActivate,
  permissions.institutionCreate,
  permissions.institutionConfigure,
  permissions.campusManage,
  permissions.organisationalUnitManage,
  permissions.academicPeriodManage,
  permissions.institutionalPolicyApprove,
  permissions.membershipRead,
  permissions.membershipManage,
  permissions.roleAssignmentRead,
  permissions.roleAssignmentManage,
  permissions.auditRead,
  permissions.peopleRead,
  permissions.peopleCreate,
  permissions.peopleUpdate,
  permissions.peopleMerge,
  permissions.learnerRead,
  permissions.learnerManage,
  permissions.staffRead,
  permissions.staffManage,
  permissions.relationshipRead,
  permissions.relationshipManage,
  permissions.peopleImportManage,
]);

export const institutionAdministratorPermissions: readonly Permission[] = Object.freeze([
  permissions.tenantRead,
  permissions.institutionConfigure,
  permissions.campusManage,
  permissions.organisationalUnitManage,
  permissions.academicPeriodManage,
  permissions.peopleRead,
  permissions.peopleCreate,
  permissions.peopleUpdate,
  permissions.peopleMerge,
  permissions.learnerRead,
  permissions.learnerManage,
  permissions.staffRead,
  permissions.staffManage,
  permissions.relationshipRead,
  permissions.relationshipManage,
  permissions.peopleImportManage,
]);

export const registrarPermissions: readonly Permission[] = Object.freeze([
  permissions.tenantRead,
  permissions.peopleRead,
  permissions.peopleCreate,
  permissions.peopleUpdate,
  permissions.peopleMerge,
  permissions.learnerRead,
  permissions.learnerManage,
  permissions.relationshipRead,
  permissions.relationshipManage,
  permissions.peopleImportManage,
]);

export const peopleViewerPermissions: readonly Permission[] = Object.freeze([
  permissions.tenantRead,
  permissions.peopleRead,
  permissions.learnerRead,
  permissions.staffRead,
  permissions.relationshipRead,
]);

export function isPermission(value: string): value is Permission {
  return Object.values(permissions).includes(value as Permission);
}
