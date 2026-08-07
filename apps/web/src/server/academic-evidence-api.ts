import type { AnalyticsMetric, CertificateVerification } from "@veza/contracts";
import { demoFixtureIds } from "./demo-workspace-data";
import { requestWorkspaceJson } from "./workspace-json-request";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;
const maximumPublicBytes = 128 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function demoMode(): boolean {
  return process.env.VEZA_DEMO_MODE === "true";
}

async function authenticated<T>(path: string): Promise<T> {
  return (await requestWorkspaceJson(path, {
    service: "Academic evidence service",
    maximumBytes,
    timeoutMs: 20_000,
  })) as T;
}

export interface AcademicEvidenceWorkspace {
  readonly institutionId: string;
  readonly assignments: readonly Readonly<Record<string, unknown>>[];
  readonly submissions: readonly Readonly<Record<string, unknown>>[];
  readonly gradebooks: readonly Readonly<Record<string, unknown>>[];
  readonly certificates: readonly Readonly<Record<string, unknown>>[];
  readonly exports: readonly Readonly<Record<string, unknown>>[];
  readonly rubrics: readonly Readonly<Record<string, unknown>>[];
  readonly assignmentGroups: readonly Readonly<Record<string, unknown>>[];
  readonly certificateTemplates: readonly Readonly<Record<string, unknown>>[];
  readonly awardRules: readonly Readonly<Record<string, unknown>>[];
}

export interface LearnerAssignmentWorkspace {
  readonly learnerPersonId: string;
  readonly assignments: readonly Readonly<Record<string, unknown>>[];
  readonly generatedAt: string;
}

export function loadAcademicEvidenceWorkspace(
  institutionId: string,
): Promise<AcademicEvidenceWorkspace> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return authenticated<AcademicEvidenceWorkspace>(`/v1/institutions/${institutionId}/academic-evidence`);
}

export async function loadLearnerAssignments(): Promise<LearnerAssignmentWorkspace> {
  if (!demoMode()) {
    return authenticated<LearnerAssignmentWorkspace>("/v1/learner/assignments");
  }

  try {
    const workspace = await authenticated<LearnerAssignmentWorkspace>("/v1/learner/assignments");
    const assignments = workspace.assignments
      .filter((assignment) => assignment.status === "published")
      .map((assignment, index) => ({
        ...assignment,
        enrolmentId: demoFixtureIds.enrolmentId,
        courseTitle:
          typeof assignment.courseRunTitle === "string"
            ? assignment.courseRunTitle
            : "Data Literacy Foundations",
        attemptCount: 1,
        latestAttemptId: `00000000-0000-4000-8000-00000000721${index + 1}`,
        latestAttemptStatus: "submitted",
        instructions: {
          overview:
            "Review the supplied evidence and distinguish observations from interpretations before making a claim.",
          deliverable:
            "Submit a concise evidence brief with one supported conclusion and one limitation.",
        },
        receiptNumber: "AKH-2026-000184",
        receiptChecksum: "demo-receipt-3b6f1c8a9d42",
        submittedAt: "2026-08-07T08:40:00.000Z",
        isLate: false,
      }));
    return { ...workspace, assignments };
  } catch {
    return {
      learnerPersonId: demoFixtureIds.demoLearnerPersonId,
      assignments: [],
      generatedAt: "2026-08-07T10:00:00.000Z",
    };
  }
}

export function loadLearnerGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  if (demoMode()) {
    return Promise.resolve({
      courseRunId,
      results: [
        {
          gradebookItemId: "00000000-0000-4000-8000-000000007311",
          title: "Lab 1: Reading patterns",
          score: 78,
          maximumScore: 100,
          publishedAt: "2026-08-03T12:15:00.000Z",
          weight: 25,
          isExempt: false,
          isExcluded: false,
          isMissing: false,
        },
        {
          gradebookItemId: "00000000-0000-4000-8000-000000007312",
          title: "Source evaluation check",
          score: 18,
          maximumScore: 20,
          publishedAt: "2026-08-06T14:30:00.000Z",
          weight: 15,
          isExempt: false,
          isExcluded: false,
          isMissing: false,
        },
      ],
    });
  }
  return authenticated<Readonly<Record<string, unknown>>>(`/v1/learner/gradebook/${courseRunId}`);
}

export function loadStaffGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  return authenticated<Readonly<Record<string, unknown>>>(`/v1/academic-evidence/gradebook/${courseRunId}/staff`);
}

export function loadInstitutionAnalytics(
  institutionId: string,
): Promise<readonly AnalyticsMetric[]> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return authenticated<readonly AnalyticsMetric[]>(`/v1/academic-evidence/analytics?institutionId=${institutionId}`);
}

export async function verifyCertificatePublic(
  code: string,
): Promise<CertificateVerification> {
  if (!/^[A-Z0-9]{8,40}$/i.test(code)) return { valid: false };
  const response = await fetch(
    `${baseUrl}/v1/public/certificates/${encodeURIComponent(code)}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status === 404) return { valid: false };
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumPublicBytes) {
    return { valid: false };
  }
  try {
    const body = JSON.parse(text) as CertificateVerification;
    return response.ok ? body : { valid: false };
  } catch {
    return { valid: false };
  }
}