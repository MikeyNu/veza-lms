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
  terminologyRead: "terminology.read",
  terminologyManage: "terminology.manage",
  terminologyApprove: "terminology.approve",
  peopleRead: "people.read",
  peopleCreate: "people.create",
  peopleUpdate: "people.update",
  peopleSensitiveManage: "people-sensitive.manage",
  peopleIdentityLink: "people-identity.link",
  peopleExport: "people.export",
  peopleMerge: "people.merge",
  learnerRead: "learner.read",
  learnerManage: "learner.manage",
  staffRead: "staff.read",
  staffManage: "staff.manage",
  relationshipRead: "relationship.read",
  relationshipManage: "relationship.manage",
  peopleImportManage: "people-import.manage",
  peopleManage: "people.manage",
  catalogueRead: "catalogue.read",
  outcomeManage: "outcome.manage",
  programmeManage: "programme.manage",
  programmeApprove: "programme.approve",
  blueprintManage: "blueprint.manage",
  blueprintApprove: "blueprint.approve",
  curriculumSubmitReview: "curriculum.submit-review",
  curriculumAnalysisRead: "curriculum-analysis.read",
  curriculumValidationManage: "curriculum-validation.manage",
  courseRunManage: "course-run.manage",
  cohortManage: "cohort.manage",
  classManage: "class.manage",
  enrolmentRead: "enrolment.read",
  enrolmentManage: "enrolment.manage",
  enrolmentTransfer: "enrolment.transfer",
  curriculumManage: "curriculum.manage",
  courseManage: "course.manage",
  courseDeliver: "course.deliver",
  studioRead: "studio.read",
  studioManage: "studio.manage",
  studioReview: "studio.review",
  studioPublish: "studio.publish",
  learnerCourseRead: "learner-course.read",
  learnerProgressRead: "learner-progress.read",
  learnerProgressManage: "learner-progress.manage",
  assignmentRead: "assignment.read",
  assignmentManage: "assignment.manage",
  submissionCreate: "submission.create",
  submissionRead: "submission.read",
  submissionGrade: "submission.grade",
  resultPublish: "result.publish",
  gradebookRead: "gradebook.read",
  gradebookManage: "gradebook.manage",
  gradebookPublish: "gradebook.publish",
  certificateRead: "certificate.read",
  certificateManage: "certificate.manage",
  certificateIssue: "certificate.issue",
  exportManage: "export.manage",
  analyticsRead: "analytics.read",
  analyticsManage: "analytics.manage",
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

const curriculumPermissions = [
  permissions.catalogueRead,
  permissions.outcomeManage,
  permissions.programmeManage,
  permissions.programmeApprove,
  permissions.blueprintManage,
  permissions.blueprintApprove,
  permissions.curriculumSubmitReview,
  permissions.curriculumAnalysisRead,
  permissions.curriculumValidationManage,
  permissions.courseRunManage,
  permissions.cohortManage,
  permissions.classManage,
  permissions.enrolmentRead,
  permissions.enrolmentManage,
  permissions.enrolmentTransfer,
] as const;

const peopleAdministrationPermissions = [
  permissions.peopleRead,
  permissions.peopleCreate,
  permissions.peopleUpdate,
  permissions.peopleSensitiveManage,
  permissions.peopleIdentityLink,
  permissions.peopleExport,
  permissions.peopleMerge,
  permissions.learnerRead,
  permissions.learnerManage,
  permissions.staffRead,
  permissions.staffManage,
  permissions.relationshipRead,
  permissions.relationshipManage,
  permissions.peopleImportManage,
] as const;

const learningAdministrationPermissions = [
  permissions.studioRead,
  permissions.studioManage,
  permissions.studioReview,
  permissions.studioPublish,
  permissions.learnerCourseRead,
  permissions.learnerProgressRead,
  permissions.learnerProgressManage,
  permissions.assignmentRead,
  permissions.assignmentManage,
  permissions.submissionRead,
  permissions.submissionGrade,
  permissions.resultPublish,
  permissions.gradebookRead,
  permissions.gradebookManage,
  permissions.gradebookPublish,
  permissions.certificateRead,
  permissions.certificateManage,
  permissions.certificateIssue,
  permissions.exportManage,
  permissions.analyticsRead,
  permissions.analyticsManage,
] as const;

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
    permissions.terminologyRead,
    permissions.terminologyManage,
    permissions.terminologyApprove,
    ...peopleAdministrationPermissions,
    ...curriculumPermissions,
    ...learningAdministrationPermissions,
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
    permissions.terminologyRead,
    permissions.terminologyManage,
    permissions.terminologyApprove,
    ...peopleAdministrationPermissions,
    ...curriculumPermissions,
    ...learningAdministrationPermissions,
  ],
  registrar: [
    permissions.membershipRead,
    permissions.academicPeriodManage,
    permissions.peopleRead,
    permissions.peopleCreate,
    permissions.peopleUpdate,
    permissions.peopleSensitiveManage,
    permissions.peopleIdentityLink,
    permissions.peopleExport,
    permissions.peopleMerge,
    permissions.learnerRead,
    permissions.learnerManage,
    permissions.relationshipRead,
    permissions.relationshipManage,
    permissions.peopleImportManage,
    permissions.terminologyRead,
    permissions.catalogueRead,
    permissions.curriculumAnalysisRead,
    permissions.courseRunManage,
    permissions.cohortManage,
    permissions.classManage,
    permissions.enrolmentRead,
    permissions.enrolmentManage,
    permissions.enrolmentTransfer,
    permissions.learnerProgressRead,
    permissions.gradebookRead,
    permissions.certificateRead,
    permissions.exportManage,
    permissions.analyticsRead,
    permissions.auditRead,
  ],
  "curriculum-manager": [
    permissions.peopleRead,
    permissions.terminologyRead,
    permissions.catalogueRead,
    permissions.outcomeManage,
    permissions.programmeManage,
    permissions.programmeApprove,
    permissions.blueprintManage,
    permissions.blueprintApprove,
    permissions.curriculumSubmitReview,
    permissions.curriculumAnalysisRead,
    permissions.curriculumManage,
    permissions.courseManage,
    permissions.studioRead,
    permissions.studioManage,
    permissions.studioReview,
  ],
  "course-manager": [
    permissions.courseManage,
    permissions.peopleRead,
    permissions.membershipRead,
    permissions.terminologyRead,
    permissions.catalogueRead,
    permissions.curriculumAnalysisRead,
    permissions.courseRunManage,
    permissions.cohortManage,
    permissions.classManage,
    permissions.enrolmentRead,
    permissions.studioRead,
    permissions.studioManage,
    permissions.studioReview,
    permissions.studioPublish,
    permissions.learnerCourseRead,
    permissions.learnerProgressRead,
    permissions.learnerProgressManage,
    permissions.assignmentRead,
    permissions.assignmentManage,
    permissions.submissionRead,
    permissions.gradebookRead,
    permissions.gradebookManage,
    permissions.certificateRead,
    permissions.analyticsRead,
  ],
  instructor: [
    permissions.courseDeliver,
    permissions.peopleRead,
    permissions.learnerRead,
    permissions.terminologyRead,
    permissions.catalogueRead,
    permissions.enrolmentRead,
    permissions.studioRead,
    permissions.learnerCourseRead,
    permissions.learnerProgressRead,
    permissions.learnerProgressManage,
    permissions.assignmentRead,
    permissions.assignmentManage,
    permissions.submissionRead,
    permissions.submissionGrade,
    permissions.gradebookRead,
    permissions.assessmentGrade,
  ],
  assessor: [
    permissions.assignmentRead,
    permissions.submissionRead,
    permissions.submissionGrade,
    permissions.gradebookRead,
    permissions.assessmentGrade,
  ],
  moderator: [
    permissions.assignmentRead,
    permissions.submissionRead,
    permissions.submissionGrade,
    permissions.resultPublish,
    permissions.gradebookRead,
    permissions.gradebookPublish,
    permissions.assessmentModerate,
    permissions.assessmentGrade,
  ],
  learner: [
    permissions.learningParticipate,
    permissions.learnerCourseRead,
    permissions.learnerProgressRead,
    permissions.assignmentRead,
    permissions.submissionCreate,
    permissions.certificateRead,
  ],
  "guardian-sponsor": [permissions.guardianSummaryRead],
  auditor: [
    permissions.evidenceRoomRead,
    permissions.auditRead,
    permissions.terminologyRead,
    permissions.catalogueRead,
    permissions.curriculumAnalysisRead,
    permissions.enrolmentRead,
    permissions.studioRead,
    permissions.learnerProgressRead,
    permissions.assignmentRead,
    permissions.submissionRead,
    permissions.gradebookRead,
    permissions.certificateRead,
    permissions.analyticsRead,
  ],
  "support-agent": [permissions.supportDiagnose, permissions.tenantRead],
});

export function permissionsForRoles(roles: readonly BaselineRoleKey[]): readonly Permission[] {
  return [...new Set(roles.flatMap((role) => rolePermissions[role]))];
}

function scopeContains(assignment: PolicyAssignment, resource: ResourceScope): boolean {
  if (assignment.scopeType === resource.type && assignment.scopeId === resource.id) return true;
  return resource.ancestors.some(
    (scope) => scope.type === assignment.scopeType && scope.id === assignment.scopeId,
  );
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
  const permissionMatches = assignments.filter(
    (assignment) => assignment.permission === permission,
  );
  if (permissionMatches.length === 0) return { allowed: false, reason: "missing-permission" };
  const scopeMatches = permissionMatches.filter((assignment) =>
    scopeContains(assignment, resource),
  );
  if (scopeMatches.length === 0) return { allowed: false, reason: "scope-mismatch" };
  const applicableAssignments = scopeMatches.filter((assignment) =>
    conditionsPass(assignment.conditions, resource, context),
  );
  if (applicableAssignments.length === 0) {
    return { allowed: false, reason: "condition-failed" };
  }
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
  return rolePermissions[role].map((permission) => ({
    effect: "allow",
    permission,
    scopeType,
    scopeId,
  }));
}
