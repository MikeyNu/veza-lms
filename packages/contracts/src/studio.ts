export type StudioBlockType = "heading" | "paragraph" | "callout" | "quote" | "image" | "video" | "audio" | "file" | "embed" | "table" | "columns" | "accordion" | "tabs" | "divider" | "code" | "equation" | "quiz" | "activity" | "outcome";

export interface StudioBlock {
  readonly id: string;
  readonly type: StudioBlockType;
  readonly data: Readonly<Record<string, unknown>>;
  readonly children?: readonly StudioBlock[];
}

export interface StudioValidationFinding {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly blockId?: string;
  readonly message: string;
}

export interface StudioValidationReport {
  readonly passed: boolean;
  readonly findings: readonly StudioValidationFinding[];
  readonly checkedAt: string;
}

export interface StudioCourseSpaceSummary {
  readonly id: string;
  readonly institutionId: string;
  readonly blueprintVersionId: string;
  readonly title: string;
  readonly status: "draft" | "in_review" | "published" | "retired";
  readonly moduleCount: number;
  readonly lessonCount: number;
  readonly currentPublicationId?: string;
  readonly version: number;
}

export interface StudioModuleRecord {
  readonly id: string;
  readonly courseSpaceId: string;
  readonly title: string;
  readonly description?: string;
  readonly sequenceNumber: number;
  readonly availabilityRule: Readonly<Record<string, unknown>>;
  readonly completionRule: Readonly<Record<string, unknown>>;
  readonly status: "draft" | "active" | "retired";
  readonly version: number;
}

export interface StudioLessonRecord {
  readonly id: string;
  readonly courseSpaceId: string;
  readonly moduleId: string;
  readonly title: string;
  readonly summary?: string;
  readonly sequenceNumber: number;
  readonly lessonType: "lesson" | "resource" | "activity" | "discussion" | "assignment-link";
  readonly estimatedMinutes?: number;
  readonly availabilityRule: Readonly<Record<string, unknown>>;
  readonly completionRule: Readonly<Record<string, unknown>>;
  readonly status: "draft" | "in_review" | "published" | "retired";
  readonly currentRevisionId?: string;
  readonly version: number;
}

export interface StudioRevisionRecord {
  readonly id: string;
  readonly lessonId: string;
  readonly revisionNumber: number;
  readonly basedOnRevisionId?: string;
  readonly blocks: readonly StudioBlock[];
  readonly checksumSha256: string;
  readonly changeSummary: string;
  readonly accessibilityReport: StudioValidationReport;
  readonly linkReport: StudioValidationReport;
  readonly readingMetrics: Readonly<Record<string, number>>;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface StudioWorkspace {
  readonly institutionId: string;
  readonly spaces: readonly StudioCourseSpaceSummary[];
  readonly modules: readonly StudioModuleRecord[];
  readonly lessons: readonly StudioLessonRecord[];
}
