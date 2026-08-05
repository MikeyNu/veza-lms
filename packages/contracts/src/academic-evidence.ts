export type AssignmentStatus = "draft" | "published" | "closed" | "archived";
export type SubmissionStatus = "draft" | "uploading" | "submitted" | "quarantined" | "accepted" | "withdrawn";
export type GradeResultState = "draft" | "published" | "corrected";

export interface AssignmentSummary {
  readonly id: string;
  readonly institutionId: string;
  readonly courseRunId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: AssignmentStatus;
  readonly groupMode: "individual" | "group";
  readonly maxAttempts: number;
  readonly allowedFormats: readonly string[];
  readonly version: number;
}

export interface SubmissionReceipt {
  readonly attemptId: string;
  readonly assignmentId: string;
  readonly enrolmentId: string;
  readonly attemptNumber: number;
  readonly status: SubmissionStatus;
  readonly receiptNumber?: string;
  readonly receiptChecksum?: string;
  readonly submittedAt?: string;
  readonly isLate: boolean;
}

export interface GradebookSummary {
  readonly courseRunId: string;
  readonly categories: readonly Readonly<Record<string, unknown>>[];
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly formula?: Readonly<Record<string, unknown>>;
  readonly results: readonly Readonly<Record<string, unknown>>[];
}

export interface CertificateVerification {
  readonly valid: boolean;
  readonly status?: "issued" | "revoked" | "superseded";
  readonly issuedAt?: string;
  readonly learnerName?: string;
  readonly credentialTitle?: string;
  readonly revocationReason?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface AnalyticsMetric {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly unit: string;
  readonly value: number;
  readonly measuredAt: string;
  readonly sourceMaxOccurredAt: string;
  readonly freshnessSeconds: number;
  readonly drillthroughFilter: Readonly<Record<string, unknown>>;
}
