import type { AnalyticsMetric, CertificateVerification } from "@veza/contracts";
import { demoFixtureIds } from "./demo-workspace-data";
import {
  optionalString,
  requireArray,
  requireBoolean,
  requireNumber,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
} from "./json-contract";
import { requestWorkspaceJson } from "./workspace-json-request";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const maximumBytes = 2 * 1024 * 1024;
const maximumPublicBytes = 128 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const certificateStatuses = ["issued", "revoked", "superseded"] as const;

function demoMode(): boolean {
  return process.env.VEZA_DEMO_MODE === "true";
}

function authenticated(path: string): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Academic evidence service",
    maximumBytes,
    timeoutMs: 20_000,
  });
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

function parseAcademicEvidenceWorkspace(value: unknown, institutionId: string): AcademicEvidenceWorkspace {
  const record = requireRecord(value, "Academic evidence workspace");
  const returnedInstitutionId = requireString(record.institutionId, "Academic evidence workspace institutionId");
  if (returnedInstitutionId !== institutionId) {
    throw new Error("Academic evidence workspace crossed the requested institution boundary");
  }
  return {
    institutionId: returnedInstitutionId,
    assignments: requireRecordArray(record.assignments, "Academic evidence assignments"),
    submissions: requireRecordArray(record.submissions, "Academic evidence submissions"),
    gradebooks: requireRecordArray(record.gradebooks, "Academic evidence gradebooks"),
    certificates: requireRecordArray(record.certificates, "Academic evidence certificates"),
    exports: requireRecordArray(record.exports, "Academic evidence exports"),
    rubrics: requireRecordArray(record.rubrics, "Academic evidence rubrics"),
    assignmentGroups: requireRecordArray(record.assignmentGroups, "Academic evidence assignment groups"),
    certificateTemplates: requireRecordArray(record.certificateTemplates, "Academic evidence certificate templates"),
    awardRules: requireRecordArray(record.awardRules, "Academic evidence award rules"),
  };
}

function parseLearnerAssignmentWorkspace(value: unknown): LearnerAssignmentWorkspace {
  const record = requireRecord(value, "Learner assignment workspace");
  return {
    learnerPersonId: requireString(record.learnerPersonId, "Learner assignment workspace learnerPersonId"),
    assignments: requireRecordArray(record.assignments, "Learner assignment workspace assignments"),
    generatedAt: requireString(record.generatedAt, "Learner assignment workspace generatedAt"),
  };
}

function parseAnalyticsMetric(value: unknown, index: number): AnalyticsMetric {
  const record = requireRecord(value, `Analytics metric[${index}]`);
  return {
    key: requireString(record.key, `Analytics metric[${index}].key`),
    title: requireString(record.title, `Analytics metric[${index}].title`),
    description: requireString(record.description, `Analytics metric[${index}].description`),
    unit: requireString(record.unit, `Analytics metric[${index}].unit`),
    value: requireNumber(record.value, `Analytics metric[${index}].value`),
    measuredAt: requireString(record.measuredAt, `Analytics metric[${index}].measuredAt`),
    sourceMaxOccurredAt: requireString(record.sourceMaxOccurredAt, `Analytics metric[${index}].sourceMaxOccurredAt`),
    freshnessSeconds: requireNumber(record.freshnessSeconds, `Analytics metric[${index}].freshnessSeconds`),
    drillthroughFilter: requireRecord(record.drillthroughFilter, `Analytics metric[${index}].drillthroughFilter`),
  };
}

function parseCertificateVerification(value: unknown): CertificateVerification {
  const record = requireRecord(value, "Certificate verification");
  const valid = requireBoolean(record.valid, "Certificate verification valid");
  const status = record.status === undefined || record.status === null
    ? undefined
    : requireOneOf(record.status, certificateStatuses, "Certificate verification status");
  const issuedAt = optionalString(record.issuedAt, "Certificate verification issuedAt");
  const learnerName = optionalString(record.learnerName, "Certificate verification learnerName");
  const credentialTitle = optionalString(record.credentialTitle, "Certificate verification credentialTitle");
  const revocationReason = optionalString(record.revocationReason, "Certificate verification revocationReason");
  const payload = record.payload === undefined || record.payload === null
    ? undefined
    : requireRecord(record.payload, "Certificate verification payload");
  return {
    valid,
    ...(status ? { status } : {}),
    ...(issuedAt ? { issuedAt } : {}),
    ...(learnerName ? { learnerName } : {}),
    ...(credentialTitle ? { credentialTitle } : {}),
    ...(revocationReason ? { revocationReason } : {}),
    ...(payload ? { payload } : {}),
  };
}

export async function loadAcademicEvidenceWorkspace(
  institutionId: string,
): Promise<AcademicEvidenceWorkspace> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return parseAcademicEvidenceWorkspace(
    await authenticated(`/v1/institutions/${institutionId}/academic-evidence`),
    institutionId,
  );
}

export async function loadLearnerAssignments(): Promise<LearnerAssignmentWorkspace> {
  if (!demoMode()) {
    return parseLearnerAssignmentWorkspace(await authenticated("/v1/learner/assignments"));
  }

  try {
    const workspace = parseLearnerAssignmentWorkspace(await authenticated("/v1/learner/assignments"));
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

export async function loadLearnerGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  if (demoMode()) {
    return {
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
    };
  }
  return requireRecord(await authenticated(`/v1/learner/gradebook/${courseRunId}`), "Learner gradebook");
}

export async function loadStaffGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  if (!uuid.test(courseRunId)) throw new Error("Course-run identifier is invalid");
  return requireRecord(
    await authenticated(`/v1/academic-evidence/gradebook/${courseRunId}/staff`),
    "Staff gradebook",
  );
}

export async function loadInstitutionAnalytics(
  institutionId: string,
): Promise<readonly AnalyticsMetric[]> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return requireArray(
    await authenticated(`/v1/academic-evidence/analytics?institutionId=${institutionId}`),
    "Institution analytics",
  ).map(parseAnalyticsMetric);
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
  if (!response.ok) return { valid: false };
  try {
    return parseCertificateVerification(JSON.parse(text));
  } catch {
    return { valid: false };
  }
}
