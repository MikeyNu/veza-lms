export type CurriculumLifecycle = "draft" | "in_review" | "approved" | "retired";
export type ProgrammeType = "qualification" | "learning-path" | "short-course" | "grade-band";
export type CurriculumDefinitionType = "subject" | "module" | "course" | "unit";
export type DeliveryMode = "in_person" | "online" | "blended" | "workplace";
export type CourseRunLifecycle = "draft" | "scheduled" | "open" | "in_progress" | "completed" | "cancelled";
export type EnrolmentStatus = "pending" | "active" | "waitlisted" | "withdrawn" | "completed" | "cancelled";

export interface LearningOutcomeSummary {
  readonly id: string;
  readonly institutionId: string;
  readonly code: string;
  readonly title: string;
  readonly outcomeType: "knowledge" | "skill" | "competency" | "graduate-attribute";
  readonly levelCode?: string;
  readonly status: "active" | "retired";
  readonly version: number;
}

export interface ProgrammeVersionSummary {
  readonly id: string;
  readonly programmeId: string;
  readonly institutionId: string;
  readonly code: string;
  readonly title: string;
  readonly programmeType: ProgrammeType;
  readonly versionNumber: number;
  readonly lifecycle: CurriculumLifecycle;
  readonly creditValue?: number;
  readonly notionalHours?: number;
  readonly durationValue?: number;
  readonly durationUnit?: "days" | "weeks" | "months" | "years";
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly submittedAt?: string;
  readonly approvedAt?: string;
  readonly approvalReviewId?: string;
  readonly courseCount: number;
  readonly version: number;
}

export interface CourseBlueprintSummary {
  readonly id: string;
  readonly courseDefinitionId: string;
  readonly parentDefinitionId?: string;
  readonly institutionId: string;
  readonly code: string;
  readonly title: string;
  readonly definitionType: CurriculumDefinitionType;
  readonly subjectArea?: string;
  readonly versionNumber: number;
  readonly lifecycle: CurriculumLifecycle;
  readonly creditValue?: number;
  readonly notionalHours?: number;
  readonly deliveryModes: readonly DeliveryMode[];
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly submittedAt?: string;
  readonly approvedAt?: string;
  readonly approvalReviewId?: string;
  readonly outcomeCount: number;
  readonly requisiteCount: number;
  readonly version: number;
}

export interface CurriculumValidationIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly field?: string;
  readonly message: string;
  readonly actual?: unknown;
  readonly expected?: unknown;
}

export interface CurriculumAnalysis {
  readonly reviewId: string;
  readonly resourceType: "programme-version" | "course-blueprint-version";
  readonly resourceId: string;
  readonly resourceVersion: number;
  readonly validation: {
    readonly passed: boolean;
    readonly errors: readonly CurriculumValidationIssue[];
    readonly warnings: readonly CurriculumValidationIssue[];
    readonly policyVersionId?: string;
  };
  readonly outcomeCoverage: Readonly<Record<string, unknown>>;
  readonly impact: Readonly<Record<string, unknown>>;
}

export interface CurriculumHistory {
  readonly resourceType: "programme-version" | "course-blueprint-version";
  readonly aggregateId: string;
  readonly versions: readonly Readonly<Record<string, unknown>>[];
  readonly reviews: readonly Readonly<Record<string, unknown>>[];
  readonly auditEvents: readonly Readonly<Record<string, unknown>>[];
}

export interface CourseRunSummary {
  readonly id: string;
  readonly institutionId: string;
  readonly academicPeriodId: string;
  readonly blueprintVersionId: string;
  readonly code: string;
  readonly title: string;
  readonly deliveryMode: DeliveryMode;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly capacity?: number;
  readonly lifecycle: CourseRunLifecycle;
  readonly classCount: number;
  readonly activeEnrolmentCount: number;
  readonly version: number;
}

export interface EnrolmentSummary {
  readonly id: string;
  readonly institutionId: string;
  readonly learnerPersonId: string;
  readonly learnerDisplayName: string;
  readonly courseRunId: string;
  readonly courseRunTitle: string;
  readonly classSectionId?: string;
  readonly cohortId?: string;
  readonly status: EnrolmentStatus;
  readonly enrolledOn: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly version: number;
}

export interface CatalogueWorkspace {
  readonly institutionId: string;
  readonly programmes: readonly ProgrammeVersionSummary[];
  readonly blueprints: readonly CourseBlueprintSummary[];
  readonly outcomes: readonly LearningOutcomeSummary[];
  readonly runs: readonly CourseRunSummary[];
  readonly enrolments: readonly EnrolmentSummary[];
}

export interface CatalogueReferences {
  readonly academicPeriods: readonly { readonly id: string; readonly code: string; readonly title: string; readonly startsOn: string; readonly endsOn: string }[];
  readonly eligibleLearners: readonly { readonly id: string; readonly displayName: string; readonly learnerStatus: string }[];
  readonly eligibleStaff: readonly { readonly id: string; readonly displayName: string; readonly staffStatus: string; readonly employeeNumber?: string }[];
  readonly cohorts: readonly { readonly id: string; readonly code: string; readonly title: string; readonly status: string }[];
  readonly classes: readonly { readonly id: string; readonly courseRunId: string; readonly cohortId?: string; readonly code: string; readonly title: string; readonly status: string; readonly version: number }[];
}
