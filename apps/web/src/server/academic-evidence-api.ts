import type { AnalyticsMetric, CertificateVerification } from "@veza/contracts";
import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticated<T>(path: string): Promise<T> {
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Academic evidence query failed");
  return body;
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
  return authenticated(`/v1/institutions/${institutionId}/academic-evidence`);
}

export function loadLearnerAssignments(): Promise<LearnerAssignmentWorkspace> {
  return authenticated("/v1/learner/assignments");
}

export function loadLearnerGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  return authenticated(`/v1/learner/gradebook/${courseRunId}`);
}

export function loadStaffGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  return authenticated(`/v1/academic-evidence/gradebook/${courseRunId}/staff`);
}

export function loadInstitutionAnalytics(
  institutionId: string,
): Promise<readonly AnalyticsMetric[]> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return authenticated(`/v1/academic-evidence/analytics?institutionId=${institutionId}`);
}

export async function verifyCertificatePublic(code: string): Promise<CertificateVerification> {
  if (!/^[A-Z0-9]{8,40}$/i.test(code)) return { valid: false };
  const response = await fetch(`${baseUrl}/v1/public/certificates/${encodeURIComponent(code)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return { valid: false };
  const body = (await response.json()) as CertificateVerification;
  return response.ok ? body : { valid: false };
}
