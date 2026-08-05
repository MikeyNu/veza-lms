export type StudioBlockType =
  | "heading"
  | "paragraph"
  | "callout"
  | "quote"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "embed"
  | "table"
  | "columns"
  | "accordion"
  | "tabs"
  | "divider"
  | "code"
  | "equation"
  | "quiz"
  | "activity"
  | "outcome";

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

export interface StudioCommentRecord {
  readonly id: string;
  readonly revisionId: string;
  readonly blockId?: string;
  readonly parentCommentId?: string;
  readonly body: string;
  readonly status: "open" | "resolved" | "reopened" | "deleted";
  readonly version: number;
  readonly createdBy: string;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioReviewRecord {
  readonly id: string;
  readonly revisionId: string;
  readonly status: "pending" | "approved" | "changes-requested" | "cancelled";
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  readonly decisionNotes?: string;
  readonly version: number;
}

export interface StudioLessonDetail extends StudioLessonRecord {
  readonly revisions: readonly StudioRevisionRecord[];
  readonly comments: readonly StudioCommentRecord[];
  readonly reviews: readonly StudioReviewRecord[];
}

export interface StudioReusableBlockRecord {
  readonly id: string;
  readonly name: string;
  readonly blockType: StudioBlockType;
  readonly content: Readonly<Record<string, unknown>>;
  readonly status: "active" | "retired";
  readonly version: number;
  readonly updatedAt: string;
}

export interface StudioAssetRecord {
  readonly id: string;
  readonly courseSpaceId?: string;
  readonly assetKind: "image" | "video" | "audio" | "document" | "archive" | "other";
  readonly objectKey: string;
  readonly originalFilename: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly malwareStatus: "pending" | "clean" | "infected" | "failed";
  readonly altText?: string;
  readonly captionText?: string;
  readonly transcriptText?: string;
  readonly durationSeconds?: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: "processing" | "ready" | "quarantined" | "deleted";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioPublicationRecord {
  readonly id: string;
  readonly courseSpaceId: string;
  readonly courseTitle: string;
  readonly publicationNumber: number;
  readonly sourceReviewId: string;
  readonly checksumSha256: string;
  readonly status: "current" | "superseded" | "withdrawn";
  readonly supersedesSnapshotId?: string;
  readonly rollbackOfSnapshotId?: string;
  readonly publishedAt: string;
}

export interface StudioImportReportRecord {
  readonly id: string;
  readonly courseSpaceId?: string;
  readonly sourceFormat: "common-cartridge" | "canvas" | "moodle" | "scorm" | "veza-json";
  readonly sourceChecksum: string;
  readonly compatibilityStatus: "compatible" | "compatible-with-warnings" | "incompatible";
  readonly report: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface StudioLibrary {
  readonly institutionId: string;
  readonly reusableBlocks: readonly StudioReusableBlockRecord[];
  readonly assets: readonly StudioAssetRecord[];
  readonly publications: readonly StudioPublicationRecord[];
  readonly importReports: readonly StudioImportReportRecord[];
}

export interface StudioWorkspace {
  readonly institutionId: string;
  readonly spaces: readonly StudioCourseSpaceSummary[];
  readonly modules: readonly StudioModuleRecord[];
  readonly lessons: readonly StudioLessonRecord[];
}
