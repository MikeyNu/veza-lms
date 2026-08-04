import type { BaselineRoleKey, ScopeType, TenantModuleKey } from "@veza/contracts";

export type Effect = "allow" | "deny";

export const permissions = Object.freeze({
  tenantRead: "tenant.read",
  tenantConfigure: "tenant.configure",
  tenantActivate: "tenant.activate",
  entitlementRead: "entitlement.read",
  entitlementManage: "entitlement.manage",
  membershipRead: "membership.read",
  membershipInvite: "membership.invite",
  membershipRoleAssign: "membership.role.assign",
  auditRead: "audit.read",
  institutionCreate: "institution.create",
  institutionConfigure: "institution.configure",
  campusManage: "campus.manage",
  organisationalUnitManage: "organisational-unit.manage",
  academicPeriodManage: "academic-period.manage",
  institutionalPolicyManage: "institutional-policy.manage",
  institutionalPolicyApprove: "institutional-policy.approve",
  peopleRead: "people.read",
  peopleManage: "people.manage",
  enrolmentManage: "enrolment.manage",
  curriculumManage: "curriculum.manage",
  courseManage: "course.manage",
  courseDeliver: "course.deliver",
  assessmentGrade: "assessment.grade",
  assessmentModerate: "assessment.moderate",
  learningParticipate: "learning.participate",
  guardianSummaryRead: "guardian.summary.read",
  evidenceRoomRead: "evidence-room.read",
  supportDiagnose: "support.diagnose",
} as const);

export type Permission = (typeof permissions)[keyof typeof permissions];

export interface PolicyConditions {
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly requiresMfa?: boolean;
  readonly ownerUserId?: string;
  readonly requiredModule?: TenantModuleKey;
}

export interface PolicyAssignment {
  readonly effect: Effect;
  readonly permission: Permission;
  readonly scopeType: ScopeType;
  readonly scopeId: string;
  readonly conditions?: PolicyConditions;
}

export interface ResourceScope {
  readonly type: ScopeType;
  readonly id: string;
  readonly ancestors: readonly Readonly<{ type: ScopeType; id: string }>[];
  readonly ownerUserId?: string;
}

export interface AccessContext {
  readonly now: string;
  readonly authenticationMethods: readonly string[];
  readonly enabledModules: readonly TenantModuleKey[];
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason:
    | "explicit-deny"
    | "missing-permission"
    | "scope-mismatch"
    | "condition-failed"
    | "allowed";
}

const rolePermissions: Readonly<Record<BaselineRoleKey, readonly Permission[]>> = Object.freeze({
  "tenant-owner": [
    permissions.tenantRead,
    permissions.tenantConfigure,
    permissions.tenantActivate,
    permissions.entitlementRead,
    permissions.entitlementManage,
    permissions.membershipRead,
    permissions.membershipInvite,
    permissions.membershipRoleAssign,
    permissions.auditRead,
    permissions.institutionCreate,
    permissions.institutionConfigure,
    permissions.campusManage,
    permissions.organisationalUnitManage,
    permissions.academicPeriodManage,
    permissions.institutionalPolicyManage,
    permissions.institutionalPolicyApprove,
    permissions.peopleRead,
  ],
  "institution-admin": [
    permissions.tenantRead,
    permissions.entitlementRead,
    permissions.membershipRead,
    permissions.membershipInvite,
    permissions.membershipRoleAssign,
    permissions.auditRead,
    permissions.institutionConfigure,
    permissions.campusManage,
    permissions.organisationalUnitManage,
    permissions.academicPeriodManage,
    permissions.institutionalPolicyManage,
    permissions.institutionalPolicyApprove,
    permissions.peopleRead,
    permissions.peopleManage,
    permissions.enrolmentManage,
    permissions.courseManage,
  ],
  registrar: [
    permissions.membershipRead,
    permissions.academicPeriodManage,
    permissions.peopleRead,
    permissions.peopleManage,
    permissions.enrolmentManage,
    permissions.auditRead,
  ],
  "curriculum-manager": [permissions.curriculumManage, permissions.courseManage, permissions.peopleRead],
  "course-manager": [permissions.courseManage, permissions.peopleRead, permissions.membershipRead],
  instructor: [permissions.courseDeliver, permissions.peopleRead, permissions.assessmentGrade],
  assessor: [permissions.assessmentGrade],
  moderator: [permissions.assessmentModerate, permissions.assessmentGrade],
  learner: [permissions.learningParticipate],
  "guardian-sponsor": [permissions.guardianSummaryRead],
  auditor: [permissions.evidenceRoomRead, permissions.auditRead],
  "support-agent": [permissions.supportDiagnose, permissions.tenantRead],
});

export function permissionsForRoles(roles: readonly BaselineRoleKey[]): readonly Permission[] {
  return [...new Set(roles.flatMap((role) => rolePermissions[role]))];
}

function scopeContains(assignment: PolicyAssignment, resource: ResourceScope): boolean {
  if (assignment.scopeType === resource.type && assignment.scopeId === resource.id) return true;
  return resource.ancestors.some((scope) => scope.type === assignment.scopeType && scope.id === assignment.scopeId);
}

function conditionsPass(
  conditions: PolicyConditions | undefined,
  resource: ResourceScope,
  context: AccessContext,
): boolean {
  if (!conditions) return true;
  const now = Date.parse(context.now);
  if (conditions.validFrom && now < Date.parse(conditions.validFrom)) return false;
  if (conditions.validUntil && now >= Date.parse(conditions.validUntil)) return false;
  if (conditions.requiresMfa && !context.authenticationMethods.includes("mfa")) return false;
  if (conditions.ownerUserId && conditions.ownerUserId !== resource.ownerUserId) return false;
  if (conditions.requiredModule && !context.enabledModules.includes(conditions.requiredModule)) return false;
  return true;
}

export function evaluateAccess(
  assignments: readonly PolicyAssignment[],
  permission: Permission,
  resource: ResourceScope,
  context: AccessContext,
): AccessDecision {
  const permissionMatches = assignments.filter((assignment) => assignment.permission === permission);
  if (permissionMatches.length === 0) return { allowed: false, reason: "missing-permission" };

  const scopeMatches = permissionMatches.filter((assignment) => scopeContains(assignment, resource));
  if (scopeMatches.length === 0) return { allowed: false, reason: "scope-mismatch" };

  const applicableAssignments = scopeMatches.filter((assignment) =>
    conditionsPass(assignment.conditions, resource, context),
  );
  if (applicableAssignments.length === 0) return { allowed: false, reason: "condition-failed" };
  if (applicableAssignments.some((assignment) => assignment.effect === "deny")) {
    return { allowed: false, reason: "explicit-deny" };
  }

  return {
    allowed: applicableAssignments.some((assignment) => assignment.effect === "allow"),
    reason: "allowed",
  };
}

export function assignmentsForRole(
  role: BaselineRoleKey,
  scopeType: ScopeType,
  scopeId: string,
): readonly PolicyAssignment[] {
  return rolePermissions[role].map((permission) => ({ effect: "allow", permission, scopeType, scopeId }));
}
