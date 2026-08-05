export type CurriculumLifecycle = "draft" | "in_review" | "approved" | "retired";
export type ProgrammeType = "qualification" | "learning-path" | "short-course" | "grade-band";
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
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly courseCount: number;
  readonly version: number;
}

export interface CourseBlueprintSummary {
  readonly id: string;
  readonly courseDefinitionId: string;
  readonly institutionId: string;
  readonly code: string;
  readonly title: string;
  readonly subjectArea?: string;
  readonly versionNumber: number;
  readonly lifecycle: CurriculumLifecycle;
  readonly creditValue?: number;
  readonly notionalHours?: number;
  readonly deliveryModes: readonly DeliveryMode[];
  readonly outcomeCount: number;
  readonly requisiteCount: number;
  readonly version: number;
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
  readonly cohorts: readonly { readonly id: string; readonly code: string; readonly title: string; readonly status: string }[];
  readonly classes: readonly { readonly id: string; readonly courseRunId: string; readonly cohortId?: string; readonly code: string; readonly title: string; readonly status: string; readonly version: number }[];
}
