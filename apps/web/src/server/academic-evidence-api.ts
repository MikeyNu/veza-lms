import type { AnalyticsMetric, CertificateVerification } from "@veza/contracts";
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

export function loadLearnerAssignments(): Promise<LearnerAssignmentWorkspace> {
  return authenticated<LearnerAssignmentWorkspace>("/v1/learner/assignments").catch((error: unknown) => {
    if (demoMode()) {
      return {
        learnerPersonId: "00000000-0000-4000-8000-000000000101",
        assignments: [],
        generatedAt: new Date().toISOString(),
      };
    }
    throw error;
  });
}

export function loadLearnerGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  return authenticated<Readonly<Record<string, unknown>>>(`/v1/learner/gradebook/${courseRunId}`).catch((error: unknown) => {
    if (demoMode()) return { results: [] };
    throw error;
  });
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
