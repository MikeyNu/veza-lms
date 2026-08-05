export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type MembershipId = Brand<string, "MembershipId">;
export type InstitutionId = Brand<string, "InstitutionId">;
export type CampusId = Brand<string, "CampusId">;
export type OrganisationalUnitId = Brand<string, "OrganisationalUnitId">;
export type AcademicPeriodId = Brand<string, "AcademicPeriodId">;
export type InstitutionalPolicyId = Brand<string, "InstitutionalPolicyId">;
export type RoleAssignmentId = Brand<string, "RoleAssignmentId">;

export type DeploymentTier = "shared" | "protected" | "sovereign";
export type TenantStatus = "provisioning" | "active" | "suspended" | "offboarding" | "closed";
export type MembershipStatus = "invited" | "active" | "suspended" | "expired" | "revoked";
export type EntitlementState = "enabled" | "disabled" | "trial";
export type ScopeType = "tenant" | "institution" | "campus" | "programme" | "course" | "cohort" | "self";

export type TenantModuleKey =
  | "core"
  | "studio-pro"
  | "exams"
  | "commerce"
  | "advanced-analytics"
  | "credentials"
  | "guardian-portal"
  | "ai-assist"
  | "integration-hub";

export type BaselineRoleKey =
  | "tenant-owner"
  | "institution-admin"
  | "registrar"
  | "curriculum-manager"
  | "course-manager"
  | "instructor"
  | "assessor"
  | "moderator"
  | "learner"
  | "guardian-sponsor"
  | "auditor"
  | "support-agent";

export interface AuthenticatedPrincipal {
  readonly userId: UserId;
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly platformRoles: readonly string[];
  readonly authenticationMethods: readonly string[];
  readonly issuedAt: string;
}

export interface RequestContext {
  readonly tenantId: TenantId;
  readonly actorId: UserId;
  readonly correlationId: string;
  readonly membershipId: MembershipId;
  readonly locale: string;
  readonly timezone: string;
  readonly authenticationMethods: readonly string[];
}

export interface TenantSummary {
  readonly id: TenantId;
  readonly slug: string;
  readonly displayName: string;
  readonly status: TenantStatus;
  readonly deploymentTier: DeploymentTier;
  readonly residencyRegion: string;
  readonly planKey: string;
  readonly locale: string;
  readonly timezone: string;
  readonly logoUrl?: string;
}

export interface MembershipSummary {
  readonly id: MembershipId;
  readonly status: MembershipStatus;
  readonly roles: readonly BaselineRoleKey[];
  readonly institutionIds: readonly InstitutionId[];
  readonly locale: string;
  readonly timezone: string;
}

export interface EntitlementSummary {
  readonly module: TenantModuleKey;
  readonly state: EntitlementState;
  readonly limits: Readonly<Record<string, number | string | boolean>>;
  readonly validUntil?: string;
}

export interface WorkspaceOption {
  readonly membershipId: MembershipId;
  readonly tenant: Pick<TenantSummary, "id" | "slug" | "displayName" | "status" | "logoUrl">;
  readonly roles: readonly BaselineRoleKey[];
  readonly label: string;
}

export interface WorkspaceSession {
  readonly principal: Pick<AuthenticatedPrincipal, "userId" | "displayName" | "email">;
  readonly tenant: TenantSummary;
  readonly membership: MembershipSummary;
  readonly entitlements: readonly EntitlementSummary[];
}

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly tenantId: TenantId;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly actorId: UserId;
  readonly correlationId: string;
  readonly payload: Readonly<TPayload>;
}

export type InstitutionType = "school" | "college" | "university" | "training-provider" | "corporate-academy" | "other";
export type InstitutionStatus = "draft" | "active" | "archived";
export type CampusDeliveryMode = "physical" | "virtual" | "hybrid";
export type CampusStatus = "draft" | "active" | "archived";
export type OrganisationalUnitType = "faculty" | "school" | "department" | "division" | "centre" | "programme-office" | "other";
export type AcademicPeriodType = "academic-year" | "semester" | "trimester" | "term" | "quarter" | "block" | "custom";
export type AcademicPeriodStatus = "draft" | "published" | "closed" | "archived";
export type InstitutionalPolicyKey = "privacy" | "data-retention" | "acceptable-use" | "academic-integrity" | "assessment" | "attendance" | "safeguarding" | "support-escalation" | "communications";
export type InstitutionalPolicyStatus = "draft" | "approved" | "retired";

export interface ActivationCheck {
  readonly key: string;
  readonly label: string;
  readonly passed: boolean;
  readonly blocking: boolean;
  readonly detail: string;
  readonly institutionId?: InstitutionId;
}

export interface TenantActivationReadiness {
  readonly tenantId: TenantId;
  readonly tenantStatus: TenantStatus;
  readonly ready: boolean;
  readonly checks: readonly ActivationCheck[];
  readonly evaluatedAt: string;
}
